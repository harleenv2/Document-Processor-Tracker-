import { ALL_DOC_TYPES } from '../docTypes.js';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileRow({ file, onUpdate, onRemove }) {
  const { id, originalName, size, mimeType, docType, personName, preview } = file;

  return (
    <tr>
      <td>
        {preview ? (
          <img src={preview} alt="preview" className="thumb" />
        ) : (
          <div className="pdf-icon">📄</div>
        )}
      </td>

      <td>
        <div className="filename" title={originalName}>{originalName}</div>
      </td>

      <td>
        <select
          className="doc-type-select"
          value={docType}
          onChange={(e) => onUpdate(id, 'docType', e.target.value)}
        >
          {ALL_DOC_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
          {!ALL_DOC_TYPES.includes(docType) && (
            <option value={docType}>{docType}</option>
          )}
          <option value="Other">Other</option>
        </select>
      </td>

      <td>
        <input
          type="text"
          className={`person-name-input${personName.trim() === '' ? ' empty' : ''}`}
          placeholder="Full name (required)"
          value={personName}
          onChange={(e) => onUpdate(id, 'personName', e.target.value)}
        />
      </td>

      <td>
        <span className="size-badge">{formatSize(size)}</span>
      </td>

      <td>
        <button className="btn-remove" title="Remove" onClick={() => onRemove(id)}>✕</button>
      </td>
    </tr>
  );
}
