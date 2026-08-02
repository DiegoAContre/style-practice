export default function FileList({
  folders,
  files,
  loading,
  onOpenFolder,
  onDownload,
  onRename,
  onDelete,
}) {
  if (loading) return <div className="filelist-loading">Loading…</div>
  if (!folders.length && !files.length) {
    return <div className="filelist-empty">This folder is empty.</div>
  }

  return (
    <div className="filelist">
      {folders.map(f => (
        <button key={f.id} className="filelist-row filelist-row-folder" onClick={() => onOpenFolder(f)}>
          <span className="filelist-icon" aria-hidden>📁</span>
          <span className="filelist-name">{f.name}</span>
          <span className="filelist-meta">—</span>
          <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
          <span className="filelist-actions" />
        </button>
      ))}
      {files.map(f => (
        <div key={f.id} className="filelist-row filelist-row-file">
          <span className="filelist-icon" aria-hidden>📄</span>
          <span className="filelist-name">{f.name}</span>
          <span className="filelist-meta">{f.size ? formatSize(f.size) : '—'}</span>
          <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
          <span className="filelist-actions">
            <button className="filelist-action" title="Download" onClick={() => onDownload(f)}>⬇</button>
            <button className="filelist-action" title="Rename" onClick={() => onRename(f)}>✎</button>
            <button className="filelist-action filelist-action-danger" title="Delete" onClick={() => onDelete(f)}>🗑</button>
          </span>
        </div>
      ))}
    </div>
  )
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}