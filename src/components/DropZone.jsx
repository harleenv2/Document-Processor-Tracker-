import { useDropzone } from 'react-dropzone';

const ACCEPTED = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/pdf': ['.pdf'],
  'application/zip': ['.zip'],
  'application/x-zip-compressed': ['.zip'],
};

export default function DropZone({ onDrop, disabled }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    disabled,
    maxSize: 50 * 1024 * 1024,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone${isDragActive ? ' active' : ''}${disabled ? ' disabled' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="dropzone-icon">📂</div>
      {isDragActive ? (
        <p>Drop files here…</p>
      ) : (
        <p>
          <strong>Click to browse</strong> or drag &amp; drop files here
          <br />
          <span style={{ fontSize: '.8rem', opacity: .7 }}>JPG, PNG, PDF, ZIP — up to 50 MB each</span>
        </p>
      )}
    </div>
  );
}
