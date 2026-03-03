import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const MAX_WIDTH = 1000;
const MAX_HEIGHT = 1414; // A4 at ~120dpi — readable for all document types
const JPEG_QUALITY = 70;

/**
 * Convert an image buffer (JPEG or PNG) to a PDF buffer.
 * The image is resized to fit within A4-ish dimensions and embedded on a single page.
 */
export async function imageToPdf(imageBuffer) {
  const compressed = await sharp(imageBuffer)
    .resize(MAX_WIDTH, MAX_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .withMetadata(false)
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  const meta = await sharp(compressed).metadata();
  const { width, height } = meta;

  const pdfDoc = await PDFDocument.create();
  const jpgImage = await pdfDoc.embedJpg(compressed);
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(jpgImage, { x: 0, y: 0, width, height });

  return pdfDoc.save();
}

/**
 * Re-serialise an existing PDF buffer through pdf-lib to normalise and compress it.
 */
export async function repackPdf(pdfBuffer) {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
  const destDoc = await PDFDocument.create();
  const pages = await destDoc.copyPages(srcDoc, srcDoc.getPageIndices());
  pages.forEach((p) => destDoc.addPage(p));
  return destDoc.save({ useObjectStreams: true });
}
