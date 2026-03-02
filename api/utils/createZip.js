import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

/**
 * Creates a ZIP file at `destPath` containing all files in `sourceDir`.
 * Returns a promise that resolves when the archive is finalised.
 */
export function createZip(sourceDir, destPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(destPath);
    const archive = archiver('zip', { zlib: { level: 6 } });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
