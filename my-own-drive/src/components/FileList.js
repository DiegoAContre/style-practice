import { useRef } from 'react'

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
  onRangeSelect,
  onOpenFolder,
  onDownloadFile,
  onRenameFile,
  onDeleteFile,
  onRenameFolder,
  onDeleteFolder,
  onShareFile,
  onShareFolder,
  viewerId,
}) {
  const lastCheckedId = useRef(null)

  if (loading) return <div className="filelist-loading">Loading…</div>
  if (!folders.length && !files.length) {
    return <div className="filelist-empty">This folder is empty.</div>
  }

  // Flat ordered id list matching render order: folders first, then files.
  const orderedIds = [
    ...folders.map(f => ({ id: f.id, kind: 'folder' })),
    ...files.map(f => ({ id: f.id, kind: 'file' })),
  ]

  // Row checkbox click with optional shift-range.
  // ponytail: mouse-only range select; no keyboard shift+arrow (needs
  //   role="row" + roving tabindex — bigger change, skip).
  function onRowClick(e, id, kind, checked) {
    if (e.shiftKey && lastCheckedId.current && lastCheckedId.current !== id) {
      const lastIdx = orderedIds.findIndex(r => r.id === lastCheckedId.current)
      const curIdx = orderedIds.findIndex(r => r.id === id)
      if (lastIdx >= 0 && curIdx >= 0) {
        const [lo, hi] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx]
        const range = orderedIds.slice(lo, hi + 1)
        onRangeSelect(range, checked)
        lastCheckedId.current = id
        return
      }
    }
    lastCheckedId.current = id
    if (kind === 'folder') onToggleFolder(folders.find(f => f.id === id))
    else onToggleFile(files.find(f => f.id === id))
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
      {folders.map(f => {
        const isOwner = !viewerId || f.owner_id === viewerId
        return (
          <div key={f.id} className="filelist-row filelist-row-folder">
            <input
              type="checkbox"
              className="filelist-check"
              checked={selectedFolders.has(f.id)}
              onChange={() => {}}
              onClick={(e) => onRowClick(e, f.id, 'folder', !selectedFolders.has(f.id))}
              aria-label={`Select ${f.name}`}
            />
            <span className="filelist-icon" aria-hidden>📁</span>
            <span className="filelist-name-cell">
              <button className="filelist-name filelist-name-button" onClick={() => onOpenFolder(f)}>{f.name}</button>
              {!isOwner && <span className="filelist-badge" title="Shared with you">Shared</span>}
            </span>
            <span className="filelist-meta">—</span>
            <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
            <span className="filelist-actions">
              {isOwner && onShareFolder && (
                <button className="filelist-action" title="Share" onClick={() => onShareFolder(f)}>↗</button>
              )}
              {isOwner && <button className="filelist-action" title="Rename" onClick={() => onRenameFolder(f)}>✎</button>}
              {isOwner && <button className="filelist-action filelist-action-danger" title="Delete" onClick={() => onDeleteFolder(f)}>🗑</button>}
            </span>
          </div>
        )
      })}
      {files.map(f => {
        const isOwner = !viewerId || f.owner_id === viewerId
        return (
          <div key={f.id} className="filelist-row filelist-row-file">
            <input
              type="checkbox"
              className="filelist-check"
              checked={selectedFiles.has(f.id)}
              onChange={() => {}}
              onClick={(e) => onRowClick(e, f.id, 'file', !selectedFiles.has(f.id))}
              aria-label={`Select ${f.name}`}
            />
            <span className="filelist-icon" aria-hidden>📄</span>
            <span className="filelist-name-cell">
              <span className="filelist-name">{f.name}</span>
              {!isOwner && <span className="filelist-badge" title="Shared with you">Shared</span>}
            </span>
            <span className="filelist-meta">{f.size ? formatSize(f.size) : '—'}</span>
            <span className="filelist-date">{new Date(f.created_at).toLocaleDateString()}</span>
            <span className="filelist-actions">
              <button className="filelist-action" title="Download" onClick={() => onDownloadFile(f)}>⬇</button>
              {isOwner && onShareFile && (
                <button className="filelist-action" title="Share" onClick={() => onShareFile(f)}>↗</button>
              )}
              {isOwner && <button className="filelist-action" title="Rename" onClick={() => onRenameFile(f)}>✎</button>}
              {isOwner && <button className="filelist-action filelist-action-danger" title="Delete" onClick={() => onDeleteFile(f)}>🗑</button>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}