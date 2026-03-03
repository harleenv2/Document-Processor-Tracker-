// Local text extraction — no API keys required.
// PDFs: uses pdf-parse to extract the text layer directly (fast, accurate).
// Images: uses tesseract.js OCR (slower but free).
// Returns extracted text string, or null on failure.

import fs from 'fs/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

export async function extractText(filePath, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      const buffer = await fs.readFile(filePath);
      const data = await pdfParse(buffer);
      const text = data.text?.trim();
      return text?.length > 0 ? text : null;
    }

    if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      const { data: { text } } = await worker.recognize(filePath);
      await worker.terminate();
      const trimmed = text?.trim();
      return trimmed?.length > 0 ? trimmed : null;
    }

    return null;
  } catch (err) {
    console.error('[extractText] Failed, falling back to Claude-only:', err.message);
    return null;
  }
}
