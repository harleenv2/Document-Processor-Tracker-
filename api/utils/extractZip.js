import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.pdf']);
const EXT_TO_MIME = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function shouldSkip(entryName) {
  const basename = path.basename(entryName);
  return basename.startsWith('.') || entryName.includes('__MACOSX');
}

export async function extractZip(zipPath, destDir) {
  const zip = new AdmZip(zipPath);
  const extracted = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || shouldSkip(entry.entryName)) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) continue;
    const fileId = uuidv4();
    const data = entry.getData();
    await fs.writeFile(path.join(destDir, `${fileId}${ext}`), data);
    extracted.push({ fileId, savedPath: path.join(destDir, `${fileId}${ext}`), mimeType: EXT_TO_MIME[ext], originalName: entry.name, size: data.length, fromZip: true });
  }
  return extracted;
}
