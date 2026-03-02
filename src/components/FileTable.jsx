import FileRow from './FileRow.jsx';

export default function FileTable({ files, onUpdate, onRemove }) {
  return (
    <div className="file-table-wrap">
      <table className="file-table">
        <thead>
          <tr>
            <th style={{ width: 56 }}>Preview</th>
            <th>File</th>
            <th style={{ width: 210 }}>Document Type</th>
            <th style={{ width: 180 }}>Person Name</th>
            <th style={{ width: 80 }}>Size</th>
            <th style={{ width: 44 }}></th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <FileRow key={f.id} file={f} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
