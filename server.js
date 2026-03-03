import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadHandler } from './api/upload.js';
import { processHandler } from './api/process.js';
import { downloadHandler, cleanupHandler } from './api/download.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
  contentSecurityPolicy: false, // allow Vite assets in dev
}));
app.use(cors());
app.use(express.json());

// API routes
app.post('/api/upload', uploadHandler);
app.post('/api/process', processHandler);
app.get('/api/download/:jobId', downloadHandler);
app.delete('/api/cleanup/:jobId', cleanupHandler);

// Serve React build in production
app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Credit Ops Tool running on http://localhost:${PORT}`);
});
