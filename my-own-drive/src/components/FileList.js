export default function FileList({
  folders,
  files,
  loading,
  selectedFiles,
  selectedFolders,
  allVisibleSelected,
  onToggleFile,
  onToggleFolder,
  onToggleSelectAll,
  onOpenFolder,
  onDownloadFile,
  onRenameFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
}) {
  if (loading) return <div className="filelist-loading">Loading…</div>
  if (!folders.length && !files.length) {
    return <div className="filelist-empty">This folder is empty.</div>
  }

  const anySelected = (selectedFiles.size + selectedFolders.size) > 0

  return (
    <div className="filelist">
      <div className="filelist-row filelist-header">
        <input
          type="checkbox"
          className="filelist-check"
          checked={allVisibleSelected}
          ref={el => { if (el) el.indeterminate = anySelected && !allVisibleSelected }}
          onChange={onToggleSelectAll}
          aria-label="Select all visible"
        />
        <span className="filelist-icon" aria-hidden />
        <span className="filelist-name">Name</span>
        <span className="filelist-meta">Size</span>
        <span className="filelist-date">Created</span>
        <span className="filelist-actions" />
      </div>
      {folders.map(f => (
        <div key={f.id} className="filelist-row filelist-row-folder">
          <input
            type="checkbox"
            className="filelist-check"
            checked={selectedFolders.has(f.id)}
            onChange={() => onToggleFolder(f)}
            aria-label={`Select ${f.name}`}
          />
          <span className="filelist-icon" aria-hidden>📁</span>
          <button className="filelist-name filelist-name-button" onClick={() => onOpenFolder(f)}>{f.name}</button>
          <span className="filelist-meta">—</span>
          <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
          <span className="filelist-actions">
            <button className="filelist-action" title="Rename" onClick={() => onRenameFolder(f)}>✎</button>
            <button className="filelist-action filelist-action-danger" title="Delete" onClick={() => onDeleteFolder(f)}>🗑</button>
          </span>
        </div>
      ))}
      {files.map(f => (
        <div key={f.id} className="filelist-row filelist-row-file">
          <input
            type="checkbox"
            className="filelist-check"
            checked={selectedFiles.has(f.id)}
            onChange={() => onToggleFile(f)}
            aria-label={`Select ${f.name}`}
          />
          <span className="filelist-icon" aria-hidden>📄</span>
          <span className="filelist-name">{f.name}</span>
          <span className="filelist-meta">{f.size ? formatSize(f.size) : '—'}</span>
          <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
          <span className="filelist-actions">
            <button className="filelist-action" title="Download" onClick={() => onDownloadFile(f)}>⬇</button>
            <button className="filelist-action" title="Rename" onClick={() => onRenameFile(f)}>✎</button>
            <button className="filelist-action filelist-action-danger" title="Delete" onClick={() => onDeleteFile(f)}>🗑</button>
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