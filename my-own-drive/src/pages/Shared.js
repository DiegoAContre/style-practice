import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import JSZip from 'jszip'
import { useCallback, useEffect, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import FileList from '../components/FileList'
import './Shared.css'

export default function Shared() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeFolder, setActiveFolder] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState({ files: new Set(), folders: new Set() })

  // load(folderId):
  //   null  → inbox root: list items explicitly shared with me
  //   id    → inside a shared folder: list its descendants (no owner filter;
  //           RLS admits them via folder_is_shared_with_me ancestor walk)
  const load = useCallback(async (folderId) => {
    setLoading(true); setError('')
    if (folderId === null) {
      // inbox root: shares from shared_items, resolved to file/folder rows
      const { data: shares, error: e1 } = await supabase
        .from('shared_items')
        .select('item_type, item_id, permission, created_at')
        .eq('shared_with_user_id', user.id)
      if (e1) { setError(e1.message); setLoading(false); return }
      const fileIds = shares.filter(s => s.item_type === 'file').map(s => s.item_id)
      const folderIds = shares.filter(s => s.item_type === 'folder').map(s => s.item_id)
      const [fRes, foRes] = await Promise.all([
        fileIds.length
          ? supabase.from('files').select('id, name, size, storage_path, owner_id, created_at').in('id', fileIds)
          : Promise.resolve({ data: [], error: null }),
        folderIds.length
          ? supabase.from('folders').select('id, name, owner_id, parent_folder_id, created_at').in('id', folderIds)
          : Promise.resolve({ data: [], error: null }),
      ])
if (fRes.error) { setError(fRes.error.message); setLoading(false); return }
      if (foRes.error) { setError(foRes.error.message); setLoading(false); return }
      setFiles(fRes.data ?? [])
      setFolders(foRes.data ?? [])
    } else {
      // inside a shared folder: descendants via RLS (no owner_id filter)
      const [foRes, fRes] = await Promise.all([
        supabase.from('folders')
          .select('id, name, owner_id, parent_folder_id, created_at')
          .eq('parent_folder_id', folderId)
          .order('name', { ascending: true }),
        supabase.from('files')
          .select('id, name, size, storage_path, owner_id, created_at')
          .eq('folder_id', folderId)
          .order('name', { ascending: true }),
      ])
      if (foRes.error) { setError(foRes.error.message); setLoading(false); return }
      if (fRes.error) { setError(fRes.error.message); setLoading(false); return }
      setFolders(foRes.data ?? [])
      setFiles(fRes.data ?? [])
    }
    setLoading(false)
  }, [user.id])

  useEffect(() => { load(activeFolder) }, [load, activeFolder])

  async function openFolder(folder) {
    setSelected({ files: new Set(), folders: new Set() })
    setActiveFolder(folder.id)
    setPath(prev => [...prev, folder])
  }

  async function navigateToFolder(folderId) {
    setSelected({ files: new Set(), folders: new Set() })
    if (folderId === null) { setActiveFolder(null); setPath([]); return }
    // walk up parent_folder_id chain building breadcrumb (RLS admits ancestors)
    const chain = []
    let current = folders.find(f => f.id === folderId)
      ? { ...folders.find(f => f.id === folderId) } : null
    while (current) {
      chain.unshift(current)
      if (!current.parent_folder_id) break
      const { data } = await supabase
        .from('folders').select('id, name, parent_folder_id')
        .eq('id', current.parent_folder_id).single()
      current = data ?? null
    }
    setActiveFolder(folderId)
    setPath(chain)
  }

  function toggleFile(f) {
    setSelected(prev => {
      const next = new Set(prev.files)
      next.has(f.id) ? next.delete(f.id) : next.add(f.id)
      return { ...prev, files: next }
    })
  }
  function toggleFolder(f) {
    setSelected(prev => {
      const next = new Set(prev.folders)
      next.has(f.id) ? next.delete(f.id) : next.add(f.id)
      return { ...prev, folders: next }
    })
  }
  function toggleSelectAll() {
    const allSel = folders.every(f => selected.folders.has(f.id)) && files.every(f => selected.files.has(f.id))
    if (allSel) setSelected({ files: new Set(), folders: new Set() })
    else setSelected({
      folders: new Set(folders.map(f => f.id)),
      files: new Set(files.map(f => f.id)),
    })
  }
  function toggleSelectRange(range, checked) {
    setSelected(prev => {
      const fns = new Set(prev.files), fds = new Set(prev.folders)
      for (const r of range) {
        if (r.kind === 'folder') checked ? fds.add(r.id) : fds.delete(r.id)
        else checked ? fns.add(r.id) : fns.delete(r.id)
      }
      return { files: fns, folders: fds }
    })
  }

  async function onDownloadFile(file) {
    setError('')
    const { data, error } = await supabase.rpc('create_share_download_url', { p_file: file.id })
    if (error || !data) { setError(error?.message ?? 'Download failed'); return }
    const a = document.createElement('a')
    a.href = data; a.download = file.name; a.target = '_blank'
    document.body.appendChild(a); a.click(); a.remove()
  }

  // Walk a shared folder's subtree using global queries (no owner filter —
  // RLS admits descendants via folder_is_shared_with_me ancestor walk).
  // ponytail: O(visible items) per call; switch to an RPC + recursive CTE
  //   if shared folders get large.
  async function collectSubtree(rootId) {
    const [fRes, fileRes] = await Promise.all([
      supabase.from('folders').select('id, name, parent_folder_id'),
      supabase.from('files').select('id, name, storage_path, folder_id'),
    ])
    if (fRes.error) return { error: fRes.error }
    if (fileRes.error) return { error: fileRes.error }
    const folderById = new Map(fRes.data.map(f => [f.id, f]))
    const byParent = new Map()
    for (const f of fRes.data) {
      const p = f.parent_folder_id ?? 'root'
      if (!byParent.has(p)) byParent.set(p, [])
      byParent.get(p).push(f.id)
    }
    const subtree = new Set([rootId])
    const queue = [rootId]
    while (queue.length) {
      const cur = queue.shift()
      for (const child of byParent.get(cur) ?? []) {
        if (!subtree.has(child)) { subtree.add(child); queue.push(child) }
      }
    }
    const filesInSubtree = fileRes.data.filter(fl => subtree.has(fl.folder_id))
    return { folderById, subtree, filesInSubtree }
  }

  function relPathInSubtree(file, rootId, folderById) {
    const chain = []
    let cur = file.folder_id
    while (cur) {
      const f = folderById.get(cur)
      if (!f) break
      chain.push(f.name)
      if (cur === rootId) break
      cur = f.parent_folder_id
    }
    chain.reverse()
    return chain.length ? `${chain.join('/')}/${file.name}` : file.name
  }

  // Download a single shared folder as a ZIP (used by folder row ⬇ button).
  async function onDownloadFolderZip(folder) {
    setError('')
    const sub = await collectSubtree(folder.id)
    if (sub.error) { setError(sub.error.message); return }
    if (!sub.filesInSubtree.length) { setError('Folder is empty'); return }
    setBusy(true)
    setProgress({ current: 0, total: sub.filesInSubtree.length, name: 'downloading', pct: 0 })
    const errs = []
    const zip = new JSZip()
    for (let i = 0; i < sub.filesInSubtree.length; i++) {
      const f = sub.filesInSubtree[i]
      const rel = relPathInSubtree(f, folder.id, sub.folderById)
      setProgress({ current: i + 1, total: sub.filesInSubtree.length, name: rel, pct: 0 })
      const { data: url, error } = await supabase.rpc('create_share_download_url', { p_file: f.id })
      if (error || !url) { errs.push(`${rel}: ${error?.message ?? 'failed'}`); continue }
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        zip.file(rel, await res.blob())
      } catch (e) { errs.push(`${rel}: ${e.message}`) }
    }
    if (errs.length) setError(errs.join('\n'))
    if (sub.filesInSubtree.length > errs.length) {
      setProgress(p => ({ ...p, name: 'compressing', pct: 0 }))
      const out = await zip.generateAsync(
        { type: 'blob' },
        (meta) => setProgress(p => ({ ...p, pct: Math.round(meta.percent) })),
      )
      const url = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = url; a.download = `${folder.name}.zip`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    }
    setBusy(false); setProgress(null)
  }

  // Download a ZIP of the current selection (files + folders). Mirrors Drive's
  // downloadZip but routes every blob via create_share_download_url.
  async function downloadZip() {
    setError('')
    const filesToZip = [] // { relPath, fileId }
    const taken = new Set()
    const claim = (relPath) => {
      const lower = relPath.toLowerCase()
      if (!taken.has(lower)) { taken.add(lower); return relPath }
      const slash = relPath.lastIndexOf('/')
      const dir = slash >= 0 ? relPath.slice(0, slash + 1) : ''
      const base = slash >= 0 ? relPath.slice(slash + 1) : relPath
      const i = base.lastIndexOf('.')
      const stem = i > 0 ? base.slice(0, i) : base
      const ext = i > 0 ? base.slice(i + 1) : ''
      let n = 1, candidate
      do { candidate = dir + (ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`); n++ }
      while (taken.has(candidate.toLowerCase()))
      taken.add(candidate.toLowerCase())
      return candidate
    }
    for (const id of selected.files) {
      const f = files.find(x => x.id === id)
      if (f) filesToZip.push({ relPath: claim(f.name), fileId: f.id })
    }
    for (const rootId of selected.folders) {
      const folder = folders.find(f => f.id === rootId)
      if (!folder) continue
      const sub = await collectSubtree(rootId)
      if (sub.error) { setError(sub.error.message); return }
      for (const f of sub.filesInSubtree) {
        const rel = relPathInSubtree(f, rootId, sub.folderById)
        filesToZip.push({ relPath: claim(rel), fileId: f.id })
      }
    }
    if (!filesToZip.length) { setSelected({ files: new Set(), folders: new Set() }); return }

    setBusy(true)
    setProgress({ current: 0, total: filesToZip.length, name: 'downloading', pct: 0 })
    const errs = []
    const zip = new JSZip()
    for (let i = 0; i < filesToZip.length; i++) {
      const { relPath, fileId } = filesToZip[i]
      setProgress({ current: i + 1, total: filesToZip.length, name: relPath, pct: 0 })
      const { data: url, error } = await supabase.rpc('create_share_download_url', { p_file: fileId })
      if (error || !url) { errs.push(`${relPath}: ${error?.message ?? 'failed'}`); continue }
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        zip.file(relPath, await res.blob())
      } catch (e) { errs.push(`${relPath}: ${e.message}`) }
    }
    if (errs.length) setError(errs.join('\n'))
    if (filesToZip.length > errs.length) {
      setProgress(p => ({ ...p, name: 'compressing', pct: 0 }))
      const out = await zip.generateAsync(
        { type: 'blob' },
        (meta) => setProgress(p => ({ ...p, pct: Math.round(meta.percent) })),
      )
      const url = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = url
      a.download = selected.folders.size === 1 && selected.files.size === 0
        ? `${folders.find(f => f.id === [...selected.folders][0])?.name ?? 'download'}.zip`
        : 'download.zip'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    }
    setBusy(false); setProgress(null)
    setSelected({ files: new Set(), folders: new Set() })
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="shared-page">
      <header className="shared-header">
        <div className="shared-header-left">
          <button
            className="shared-up"
            disabled={path.length === 0}
            onClick={() => navigateToFolder(path.length > 1 ? path[path.length - 2].id : null)}
            title="Up one level"
          >
            ↑
          </button>
          <Breadcrumb path={path} onNavigate={navigateToFolder} rootLabel="Shared with me" />
        </div>
        <div className="shared-header-actions">
          <button className="shared-signout" onClick={() => navigate('/drive')}>My drive</button>
          <button className="shared-signout" onClick={() => navigate('/profile')}>Profile</button>
          <button className="shared-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="shared-main">
        <div className="shared-toolbar">
          {progress && (
            <div className="shared-progress">
              <div className="shared-progress-meta">
                Download {progress.current}/{progress.total} — {progress.name}
              </div>
              <div className="shared-progress-bar"><div style={{ width: `${progress.pct}%` }} /></div>
            </div>
          )}
          {selected.files.size + selected.folders.size > 0 && (
            <button className="shared-zip" onClick={downloadZip} disabled={busy}>
              {busy ? 'Downloading…' : `Download ZIP (${selected.files.size + selected.folders.size})`}
            </button>
          )}
          {error && <pre className="shared-error">{error}</pre>}
        </div>
        <FileList
          folders={folders}
          files={files}
          loading={loading}
          selectedFiles={selected.files}
          selectedFolders={selected.folders}
          allVisibleSelected={
            folders.length + files.length > 0 &&
            folders.every(f => selected.folders.has(f.id)) &&
            files.every(f => selected.files.has(f.id))
          }
          onToggleFile={toggleFile}
          onToggleFolder={toggleFolder}
          onToggleSelectAll={toggleSelectAll}
          onRangeSelect={toggleSelectRange}
          onOpenFolder={openFolder}
          onDownloadFile={onDownloadFile}
          onDownloadFolderZip={onDownloadFolderZip}
          viewerId={user.id}
        />
      </main>
    </div>
  )
}