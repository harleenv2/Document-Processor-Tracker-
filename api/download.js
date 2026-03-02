import path from 'path';
import os from 'os';
import fs from 'fs';

export function downloadHandler(req, res) {
  const { jobId } = req.params;
  // Validate jobId is a UUID to prevent path traversal
  if (!/^[0-9a-f-]{36}$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  const jobDir = path.join(os.tmpdir(), 'credit-ops', jobId);

  try {
    const files = fs.readdirSync(jobDir).filter((f) => f.endsWith('.zip'));
    if (files.length === 0) {
      return res.status(404).json({ error: 'ZIP not found. Process files first.' });
    }

    const zipPath = path.join(jobDir, files[0]);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${files[0]}"`);
    fs.createReadStream(zipPath).pipe(res);
  } catch {
    res.status(404).json({ error: 'Job not found.' });
  }
}

export function cleanupHandler(req, res) {
  const { jobId } = req.params;
  if (!/^[0-9a-f-]{36}$/.test(jobId)) {
    return res.status(400).json({ error: 'Invalid job ID.' });
  }

  const dir = path.join(os.tmpdir(), 'credit-ops', jobId);
  fs.rm(dir, { recursive: true, force: true }, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Cleanup failed.' });
    }
    res.json({ ok: true });
  });
}
