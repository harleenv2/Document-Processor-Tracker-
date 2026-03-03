import { useState, useCallback } from 'react';
import DropZone from './components/DropZone.jsx';
import FileTable from './components/FileTable.jsx';

export default function App() {
  const [caseRef, setCaseRef] = useState('');
  const [files, setFiles] = useState([]);   // { id, file, originalName, size, mimeType, docType, personName, preview }
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | processing | done | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleDrop = useCallback(async (accepted) => {
    if (accepted.length === 0) return;

    setStatus('uploading');
    setErrorMsg('');

    const formData = new FormData();
    accepted.forEach((f) => formData.append('files', f));

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setJobId(data.jobId);
      let directIdx = 0;
      const newFiles = data.files.map((f) => {
        const srcFile = f.fromZip ? null : accepted[directIdx++];
        return {
          id: f.fileId,
          fileJobId: data.jobId,
          originalName: f.originalName,
          size: f.size,
          mimeType: f.mimeType,
          docType: f.detectedDocType,
          personName: f.personName || '',
          period: f.period || null,
          periodStart: f.periodStart || null,
          periodEnd: f.periodEnd || null,
          aiAnalyzed: f.aiAnalyzed || false,
          preview: (!f.fromZip && srcFile?.type?.startsWith('image/'))
            ? URL.createObjectURL(srcFile)
            : null,
        };
      });
      setFiles((prev) => [...prev, ...newFiles]);
      setStatus('idle');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  }, []);

  const updateFile = useCallback((id, field, value) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  }, []);

  const removeFile = useCallback((id) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const canProcess = files.length > 0 && files.every((f) => f.personName.trim() !== '');

  const handleProcess = async () => {
    setStatus('processing');
    setErrorMsg('');

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          caseRef: caseRef.trim() || 'documents',
          files: files.map((f) => ({
            fileId: f.id,
            fileJobId: f.fileJobId,
            docType: f.docType,
            personName: f.personName,
            period: f.period,
            periodStart: f.periodStart,
            periodEnd: f.periodEnd,
            mimeType: f.mimeType,
            originalName: f.originalName,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');

      // Trigger download
      const link = document.createElement('a');
      link.href = `/api/download/${jobId}`;
      link.download = data.zipName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup on server
      fetch(`/api/cleanup/${jobId}`, { method: 'DELETE' });

      setStatus('done');
    } catch (err) {
      setErrorMsg(err.message);
      setStatus('error');
    }
  };

  const handleReset = () => {
    files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setFiles([]);
    setJobId(null);
    setCaseRef('');
    setStatus('idle');
    setErrorMsg('');
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Credit Ops Document Tool</h1>
        <p className="subtitle">Upload, rename, convert and package case documents</p>
      </header>

      <main className="app-main">
        <div className="case-ref-row">
          <label htmlFor="caseRef">Case Reference</label>
          <input
            id="caseRef"
            type="text"
            placeholder="e.g. CASE-2024-001"
            value={caseRef}
            onChange={(e) => setCaseRef(e.target.value)}
          />
        </div>

        <DropZone onDrop={handleDrop} disabled={status === 'uploading' || status === 'processing'} />

        {files.length > 0 && (
          <FileTable files={files} onUpdate={updateFile} onRemove={removeFile} />
        )}

        {errorMsg && <div className="error-banner">{errorMsg}</div>}

        <div className="action-row">
          {files.length > 0 && (
            <>
              <button
                className="btn btn-primary"
                onClick={handleProcess}
                disabled={!canProcess || status === 'uploading' || status === 'processing'}
              >
                {status === 'processing' ? 'Processing...' : 'Process & Download ZIP'}
              </button>
              <button className="btn btn-secondary" onClick={handleReset}>
                Reset
              </button>
            </>
          )}
        </div>

        {status === 'done' && (
          <div className="success-banner">
            Done! Your ZIP has been downloaded. Click Reset to start a new batch.
          </div>
        )}

        {(status === 'uploading' || status === 'processing') && (
          <div className="progress-overlay">
            <div className="spinner" />
            <p>{status === 'uploading' ? 'Uploading & analysing documents…' : 'Processing & building ZIP...'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
