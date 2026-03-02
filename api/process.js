import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { imageToPdf, repackPdf } from './utils/convertToPdf.js';
import { createZip } from './utils/createZip.js';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);

function sanitiseName(name) {
  return name.replace(/[/\\:*?"<>|]/g, '_').trim() || 'file';
}

export async function processHandler(req, res) {
  const { jobId, files, caseRef } = req.body;

  if (!jobId || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  const uploadDir = path.join(os.tmpdir(), 'credit-ops', jobId, 'uploads');
  const outputDir = path.join(os.tmpdir(), 'credit-ops', jobId, 'output');

  try {
    await fs.mkdir(outputDir, { recursive: true });

    // Track name collisions and add numeric suffix when needed
    const usedNames = new Map();

    await Promise.all(
      files.map(async ({ fileId, docType, personName, mimeType, originalName }) => {
        const ext = path.extname(originalName).toLowerCase();
        const uploadedExt = ['.jpg', '.jpeg', '.png'].includes(ext) ? ext : '.pdf';
        const srcPath = path.join(uploadDir, `${fileId}${uploadedExt}`);

        const rawBuffer = await fs.readFile(srcPath);
        let pdfBuffer;

        if (IMAGE_MIMES.has(mimeType)) {
          pdfBuffer = await imageToPdf(rawBuffer);
        } else {
          pdfBuffer = await repackPdf(rawBuffer);
        }

        const safeName = `${sanitiseName(docType)}_${sanitiseName(personName)}`;
        const key = safeName.toLowerCase();
        const count = (usedNames.get(key) || 0) + 1;
        usedNames.set(key, count);

        const outFilename = count === 1 ? `${safeName}.pdf` : `${safeName}_${count}.pdf`;
        await fs.writeFile(path.join(outputDir, outFilename), pdfBuffer);
      })
    );

    const safeCase = sanitiseName(caseRef || 'documents');
    const zipPath = path.join(os.tmpdir(), 'credit-ops', jobId, `${safeCase}.zip`);
    await createZip(outputDir, zipPath);

    res.json({ jobId, zipName: `${safeCase}.zip` });
  } catch (err) {
    console.error('process error', err);
    res.status(500).json({ error: 'Processing failed: ' + err.message });
  }
}
