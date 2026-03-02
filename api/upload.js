import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { detectDocType } from './utils/detectDocType.js';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
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
  if (ALLOWED_MIMES.has(file.mimetype)) {
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

  upload.array('files', 50)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded.' });
    }

    const files = req.files.map((f) => ({
      fileId: path.basename(f.filename, path.extname(f.filename)),
      originalName: f.originalname,
      size: f.size,
      mimeType: f.mimetype,
      detectedDocType: detectDocType(f.originalname),
    }));

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
