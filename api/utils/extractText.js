// Text extraction pipeline — strategies in priority order:
// 1. pdf-parse: for PDFs with a text layer (fast, free, no API needed)
//    + pdf-lib form fields: captures filled-in values from fillable PDF forms
// 2. Google Cloud Vision: for scanned PDFs and images (best accuracy)
// 3. tesseract.js: for images when Google Vision is not configured (free, local)
// Falls back gracefully to null (Claude-only) on any failure.

import fs from 'fs/promises';
import { createRequire } from 'module';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// ── PDF form field extraction ─────────────────────────────────────────────────

async function extractFormFields(buffer) {
  try {
    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    if (fields.length === 0) return null;

    const lines = [];
    for (const field of fields) {
      try {
        const name = field.getName();
        let value = '';
        const type = field.constructor.name;
        if (type === 'PDFTextField') value = field.getText() ?? '';
        else if (type === 'PDFDropdown') value = field.getSelected()?.join(', ') ?? '';
        else if (type === 'PDFCheckBox') value = field.isChecked() ? 'Yes' : '';
        if (value.trim()) lines.push(`${name}: ${value.trim()}`);
      } catch { /* skip unreadable field */ }
    }
    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

// ── Google Cloud Vision ──────────────────────────────────────────────────────

async function visionOcr(filePath, mimeType) {
  const GOOGLE_VISION_KEY = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!GOOGLE_VISION_KEY) return null;

  try {
    const base64 = await fs.readFile(filePath, { encoding: 'base64' });

    let url, body;

    if (mimeType === 'application/pdf') {
      // files:annotate accepts base64 PDFs directly — no image conversion needed
      url = `https://vision.googleapis.com/v1/files:annotate?key=${GOOGLE_VISION_KEY}`;
      body = {
        requests: [{
          inputConfig: { content: base64, mimeType: 'application/pdf' },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages: [1, 2, 3],
        }],
      };
    } else {
      // images:annotate for JPG/PNG
      url = `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_KEY}`;
      body = {
        requests: [{
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[Vision] API error:', data.error?.message);
      return null;
    }

    // PDF response is nested one level deeper than image response
    const text = mimeType === 'application/pdf'
      ? data.responses?.[0]?.responses?.[0]?.fullTextAnnotation?.text
      : data.responses?.[0]?.fullTextAnnotation?.text;

    return text?.trim() || null;

  } catch (err) {
    console.error('[Vision] Failed:', err.message);
    return null;
  }
}

// ── Tesseract (local fallback for images) ────────────────────────────────────

async function tesseractOcr(filePath) {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(filePath);
    await worker.terminate();
    return text?.trim() || null;
  } catch (err) {
    console.error('[Tesseract] Failed:', err.message);
    return null;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function extractText(filePath, mimeType) {
  try {
    if (mimeType === 'application/pdf') {
      const buffer = await fs.readFile(filePath);

      // Run text layer + form field extraction in parallel
      const [parseData, formFields] = await Promise.all([
        pdfParse(buffer).catch(() => null),
        extractFormFields(buffer),
      ]);

      const layerText = parseData?.text?.trim() || '';

      // Combine: put form fields first (they contain actual values like names)
      const combined = [formFields, layerText].filter(Boolean).join('\n\n---\n\n');
      if (combined.length > 0) return combined;

      // Scanned PDF — use Google Vision if available
      return await visionOcr(filePath, mimeType);
    }

    if (mimeType === 'image/jpeg' || mimeType === 'image/png') {
      // Google Vision > Tesseract for images
      const visionText = await visionOcr(filePath, mimeType);
      if (visionText) return visionText;
      return await tesseractOcr(filePath);
    }

    return null;
  } catch (err) {
    console.error('[extractText] Failed, falling back to Claude-only:', err.message);
    return null;
  }
}
