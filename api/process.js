import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { imageToPdf, repackPdf } from './utils/convertToPdf.js';
import { mergePdfs } from './utils/mergePdfs.js';
import { createZip } from './utils/createZip.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);

const KYC_TYPES = new Set(['Passport', 'Emirates ID', 'Residence Visa', 'ID Document']);

function sanitiseName(name) {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'file';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatYearMonth(ym) {
  // ym is "YYYY-MM"
  const [year, month] = ym.split('-');
  return `${MONTH_NAMES[parseInt(month, 10) - 1]} ${year}`;
}

function buildPeriodLabel(sortedFiles) {
  if (sortedFiles.length === 1) {
    return sortedFiles[0].period || formatYearMonth(sortedFiles[0].periodStart);
  }
  const first = sortedFiles[0].periodStart;
  const last = sortedFiles[sortedFiles.length - 1].periodEnd || sortedFiles[sortedFiles.length - 1].periodStart;
  return `${formatYearMonth(first)} - ${formatYearMonth(last)}`;
}

export async function processHandler(req, res) {
  const { jobId, files, caseRef } = req.body;

  if (!jobId || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const outputDir = path.join(os.tmpdir(), 'credit-ops', jobId, 'output');

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // Step 1: Convert all files to PDF buffers in parallel
    const pdfBuffers = new Map(); // fileId -> Buffer

    await Promise.all(
      files.map(async ({ fileId, fileJobId, mimeType, originalName }) => {
        const ext = path.extname(originalName).toLowerCase();
        const uploadedExt = ['.jpg', '.jpeg', '.png'].includes(ext) ? ext : '.pdf';
        const fileUploadDir = path.join(os.tmpdir(), 'credit-ops', fileJobId || jobId, 'uploads');
        const srcPath = path.join(fileUploadDir, `${fileId}${uploadedExt}`);

        const rawBuffer = await fs.readFile(srcPath);
        const pdfBuffer = IMAGE_MIMES.has(mimeType)
          ? await imageToPdf(rawBuffer)
          : await repackPdf(rawBuffer);

        pdfBuffers.set(fileId, pdfBuffer);
      })
    );

    // Step 2: Group files into buckets
    const kycGroups = new Map();    // personName -> file[]
    const bankGroups = new Map();   // personName -> file[]
    const payslipGroups = new Map(); // personName -> file[]
    const individualFiles = [];

    for (const file of files) {
      const { docType, personName } = file;
      if (KYC_TYPES.has(docType)) {
        if (!kycGroups.has(personName)) kycGroups.set(personName, []);
        kycGroups.get(personName).push(file);
      } else if (docType === 'Bank Statement') {
        if (!bankGroups.has(personName)) bankGroups.set(personName, []);
        bankGroups.get(personName).push(file);
      } else if (docType === 'Pay Slip') {
        if (!payslipGroups.has(personName)) payslipGroups.set(personName, []);
        payslipGroups.get(personName).push(file);
      } else {
        individualFiles.push(file);
      }
    }

    // Step 3: Write merged and individual outputs
    const usedNames = new Map();

    function resolveFilename(baseName) {
      const key = baseName.toLowerCase();
      const count = (usedNames.get(key) || 0) + 1;
      usedNames.set(key, count);
      return count === 1 ? `${baseName}.pdf` : `${baseName}_${count}.pdf`;
    }

    // KYC merges
    for (const [personName, group] of kycGroups) {
      const buffers = group.map((f) => pdfBuffers.get(f.fileId));
      const merged = buffers.length > 1 ? await mergePdfs(buffers) : buffers[0];
      const baseName = `KYC_${sanitiseName(personName)}`;
      await fs.writeFile(path.join(outputDir, resolveFilename(baseName)), merged);
    }

    // Bank Statement merges
    for (const [personName, group] of bankGroups) {
      const sorted = group
        .filter((f) => f.periodStart)
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
      const unsorted = group.filter((f) => !f.periodStart);
      const orderedGroup = [...sorted, ...unsorted];

      const buffers = orderedGroup.map((f) => pdfBuffers.get(f.fileId));
      const merged = buffers.length > 1 ? await mergePdfs(buffers) : buffers[0];

      let baseName;
      if (sorted.length > 0) {
        const label = buildPeriodLabel(sorted);
        baseName = `Bank Statement_${sanitiseName(personName)}_${sanitiseName(label)}`;
      } else {
        baseName = `Bank Statement_${sanitiseName(personName)}`;
      }
      await fs.writeFile(path.join(outputDir, resolveFilename(baseName)), merged);
    }

    // Payslip merges
    for (const [personName, group] of payslipGroups) {
      const sorted = group
        .filter((f) => f.periodStart)
        .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
      const unsorted = group.filter((f) => !f.periodStart);
      const orderedGroup = [...sorted, ...unsorted];

      const buffers = orderedGroup.map((f) => pdfBuffers.get(f.fileId));
      const merged = buffers.length > 1 ? await mergePdfs(buffers) : buffers[0];

      let baseName;
      if (sorted.length > 0) {
        const label = buildPeriodLabel(sorted);
        baseName = `Payslips_${sanitiseName(personName)}_${sanitiseName(label)}`;
      } else {
        baseName = `Payslips_${sanitiseName(personName)}`;
      }
      await fs.writeFile(path.join(outputDir, resolveFilename(baseName)), merged);
    }

    // Individual files (all other doc types)
    for (const { fileId, docType, personName } of individualFiles) {
      const baseName = `${sanitiseName(docType)}_${sanitiseName(personName)}`;
      await fs.writeFile(path.join(outputDir, resolveFilename(baseName)), pdfBuffers.get(fileId));
    }

    const safeCase = sanitiseName(caseRef || 'documents');
    const zipPath = path.join(os.tmpdir(), 'credit-ops', jobId, `${safeCase}.zip`);
    await createZip(outputDir, zipPath);

    res.json({ jobId, zipName: `${safeCase}.zip` });
  } catch (err) {
    console.error('process error', err);
    res.status(500).json({ error: 'Processing failed: ' + err.message });
  }
}
