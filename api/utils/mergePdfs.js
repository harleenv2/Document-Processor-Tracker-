import { PDFDocument } from 'pdf-lib';

/**
 * Merges an array of PDF buffers into a single PDF buffer.
 * Pages from each input document are appended in order.
 */
export async function mergePdfs(buffers) {
  const merged = await PDFDocument.create();

  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }

  const bytes = await merged.save({ useObjectStreams: true });
  return Buffer.from(bytes);
}
