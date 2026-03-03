import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { detectDocType } from './utils/detectDocType.js';
import { analyzeDocument } from './utils/analyzeDocument.js';
import { extractZip } from './utils/extractZip.js';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const ZIP_MIMES = new Set(['application/zip', 'application/x-zip-compressed']);
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const jobId = req.jobId;
    const dir = path.join(os.tmpdir(), 'credit-ops', jobId, 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${fileId}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_MIMES.has(file.mimetype) || ZIP_MIMES.has(file.mimetype) || ext === '.zip') {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

export function uploadHandler(req, res) {
  // Assign a jobId before multer runs so the storage dest can use it
  req.jobId = uuidv4();

  upload.array('files', 50)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const uploadsDir = path.join(os.tmpdir(), 'credit-ops', req.jobId, 'uploads');
    const toAnalyse = [];

    for (const f of req.files) {
      const ext = path.extname(f.originalname).toLowerCase();
      if (ZIP_MIMES.has(f.mimetype) || ext === '.zip') {
        const extracted = await extractZip(f.path, uploadsDir);
        await fsPromises.unlink(f.path);
        toAnalyse.push(...extracted);
      } else {
        toAnalyse.push({
          fileId: path.basename(f.filename, path.extname(f.filename)),
          savedPath: f.path,
          mimeType: f.mimetype,
          originalName: f.originalname,
          size: f.size,
          fromZip: false,
        });
      }
    }

    if (toAnalyse.length === 0) {
      return res.status(400).json({ error: 'ZIP was empty or contained no supported files.' });
    }

    // Run AI analysis in batches of 3 to avoid API rate limits
    const BATCH_SIZE = 3;
    const analysisResults = [];
    for (let i = 0; i < toAnalyse.length; i += BATCH_SIZE) {
      const batch = toAnalyse.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((f) => analyzeDocument(f.savedPath, f.mimeType))
      );
      analysisResults.push(...batchResults);
    }

    const files = toAnalyse.map((f, i) => {
      const result = analysisResults[i];
      if (result.status === 'fulfilled') {
        return {
          fileId: f.fileId,
          originalName: f.originalName,
          size: f.size,
          mimeType: f.mimeType,
          detectedDocType: result.value.docType,
          personName: result.value.personName,
          period: result.value.period,
          periodStart: result.value.periodStart,
          periodEnd: result.value.periodEnd,
          aiAnalyzed: true,
          fromZip: f.fromZip,
        };
      } else {
        // AI failed — fall back to filename-based detection
        return {
          fileId: f.fileId,
          originalName: f.originalName,
          size: f.size,
          mimeType: f.mimeType,
          detectedDocType: detectDocType(f.originalName),
          personName: '',
          period: null,
          periodStart: null,
          periodEnd: null,
          aiAnalyzed: false,
          fromZip: f.fromZip,
        };
      }
    });

    // Schedule auto-cleanup after 1 hour
    scheduleCleanup(req.jobId);

    res.json({ jobId: req.jobId, files });
  });
}

function scheduleCleanup(jobId) {
  setTimeout(() => {
    const dir = path.join(os.tmpdir(), 'credit-ops', jobId);
    fs.rm(dir, { recursive: true, force: true }, () => {});
  }, 60 * 60 * 1000);
}
