import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import JSZip from 'jszip'
import { useCallback, useEffect, useRef, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import FileList from '../components/FileList'
import Modal from '../components/Modal'
import './Drive.css'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB — Supabase free-tier storage default

export default function Drive() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeFolder, setActiveFolder] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragCounter = useRef(0)
  const [selected, setSelected] = useState({ files: new Set(), folders: new Set() })
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null) // { type: 'rename'|'delete', file }
  const [modalName, setModalName] = useState('')
  const fileInput = useRef(null)
  const folderInput = useRef(null)

  const load = useCallback(async (folderId) => {
    setLoading(true)
    const foldersQ = supabase
      .from('folders')
      .select('id, name, created_at, parent_folder_id')
      .eq('owner_id', user.id)
    const filesQ = supabase
      .from('files')
      .select('id, name, size, mime_type, storage_path, created_at')
      .eq('owner_id', user.id)
    if (folderId) {
      foldersQ.eq('parent_folder_id', folderId)
      filesQ.eq('folder_id', folderId)
    } else {
      foldersQ.is('parent_folder_id', null)
      filesQ.is('folder_id', null)
    }
    const [fRes, fileRes] = await Promise.all([
      foldersQ.order('name', { ascending: true }),
      filesQ.order('name', { ascending: true }),
    ])
    setError('')
    const err = fRes.error || fileRes.error
    if (err) { setError(err.message); setLoading(false); return }
    setFolders(fRes.data ?? [])
    setFiles(fileRes.data ?? [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    let cancelled = false
    load(activeFolder).then(() => { if (cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [load, activeFolder])

  async function openFolder(folder) {
    setActiveFolder(folder.id)
    setPath(prev => [...prev, folder])
  }

  async function navigateToFolder(folderId) {
    setSelected({ files: new Set(), folders: new Set() })
    if (folderId === null) {
      setActiveFolder(null)
      setPath([])
      return
    }
    const chain = []
    let current = folders.find(f => f.id === folderId)
      ? { ...folders.find(f => f.id === folderId) }
      : null
    while (current) {
      chain.unshift(current)
      if (!current.parent_folder_id) break
      const { data } = await supabase
        .from('folders')
        .select('id, name, parent_folder_id')
        .eq('id', current.parent_folder_id)
        .single()
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

  async function findFolder(parent, name) {
    let q = supabase.from('folders').select('id').eq('owner_id', user.id).ilike('name', name)
    if (parent) q = q.eq('parent_folder_id', parent)
    else q = q.is('parent_folder_id', null)
    const { data } = await q.maybeSingle()
    return data?.id ?? null
  }

  // ponytail: fixed 1s delay, no backoff/jitter, no error classification
  //   (retries validation failures harmlessly). Switch to exponential + jitter
  //   + a transient classifier under real concurrency.
  function withRetry(fn, attempts = 3) {
    return async (...args) => {
      let lastErr
      for (let a = 0; a < attempts; a++) {
        try { return await fn(...args) }
        catch (e) { lastErr = e; if (a < attempts - 1) await new Promise(r => setTimeout(r, 1000)) }
      }
      throw lastErr
    }
  }

  // split "foo.txt" -> ["foo", "txt"]; "foo" -> ["foo", ""]; "foo.tar.gz" -> ["foo.tar", "gz"]
  function splitName(name) {
    const i = name.lastIndexOf('.')
    return i > 0 ? [name.slice(0, i), name.slice(i + 1)] : [name, '']
  }

  function dedupeName(name, taken) {
    if (!taken.has(name.toLowerCase())) return name
    const [stem, ext] = splitName(name)
    let n = 1, candidate
    do { candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`; n++ }
    while (taken.has(candidate.toLowerCase()))
    return candidate
  }

  // Unified upload routine used by the file picker, the folder picker, and
  // drag-drop. Each File may carry a synthetic webkitRelativePath
  // ("dir/sub/file.txt") describing where it lives under activeFolder.
  // ponytail: sequential uploads (no concurrency pool); N folder-select
  //   queries per upload (N = unique path segments). Switch to a 3-at-a-time
  //   pool + a parent-chain RPC when large queues feel slow.
  async function uploadFiles(list) {
    if (!list.length) return
    setError('')
    setUploading(true)
    setProgress({ current: 0, total: list.length, name: '', pct: 0 })
    const errs = []

    // Collect unique folder directory paths (everything but the last segment of
    // webkitRelativePath), shallow → deep so parents are created first.
    const dirPaths = Array.from(new Set(
      list.map(f => f.webkitRelativePath || f.name).map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean)
    )).sort((a, b) => a.split('/').length - b.split('/').length)

    // Find-or-create each dir path under activeFolder. Cache by "parentId|name".
    const dirId = new Map()
    for (const dp of dirPaths) {
      let parent = activeFolder
      for (const seg of dp.split('/')) {
        const key = `${parent ?? 'root'}|${seg}`
        if (dirId.has(key)) { parent = dirId.get(key); continue }
        let id = await findFolder(parent, seg)
        if (!id) {
          const { data: created, error } = await supabase.from('folders').insert({
            owner_id: user.id, parent_folder_id: parent, name: seg,
          }).select('id').single()
          if (error) { errs.push(`folder ${seg}: ${error.message}`); break }
          id = created.id
        }
        dirId.set(key, id)
        parent = id
      }
    }

    let i = 0
    // Pre-pass: existing file names per target folder, case-insensitive.
    // ponytail: one query per upload (plus root branch). Fine until an upload
    //   targets thousands of folders; then an .in() on a coalesced expression.
    const existingPerFolder = new Map()
    const targetFolderIds = new Set([activeFolder, ...dirId.values()].filter(Boolean))
    if (targetFolderIds.size) {
      const { data: existingRows } = await supabase.from('files')
        .select('name, folder_id').eq('owner_id', user.id).in('folder_id', [...targetFolderIds])
      for (const r of existingRows ?? []) {
        if (!existingPerFolder.has(r.folder_id)) existingPerFolder.set(r.folder_id, new Set())
        existingPerFolder.get(r.folder_id).add(r.name.toLowerCase())
      }
    }
    if (activeFolder === null) {
      const { data: rootRows } = await supabase.from('files')
        .select('name').eq('owner_id', user.id).is('folder_id', null)
      existingPerFolder.set(null, new Set((rootRows ?? []).map(r => r.name.toLowerCase())))
    }

    for (const file of list) {
      i++
      setProgress({ current: i, total: list.length, name: file.name, pct: 0 })
      if (file.size > MAX_FILE_SIZE) {
        errs.push(`${file.name}: exceeds 50 MB`)
        continue
      }
      const dp = (file.webkitRelativePath || file.name).split('/').slice(0, -1).join('/')
      let folderId = activeFolder
      let parent = activeFolder
      for (const seg of dp ? dp.split('/') : []) {
        folderId = dirId.get(`${parent ?? 'root'}|${seg}`)
        parent = folderId
      }
      // Dedupe against existing + already-claimed-in-this-batch (case-insensitive).
      if (!existingPerFolder.has(folderId)) existingPerFolder.set(folderId, new Set())
      const taken = existingPerFolder.get(folderId)
      const name = dedupeName(file.name, taken)
      taken.add(name.toLowerCase())

      const fileId = crypto.randomUUID()
      const storagePath = `${user.id}/${fileId}/${name}`
      // Retry the upload+insert unit; on insert failure remove the orphan blob
      // before the next attempt so we don't accumulate duplicates in storage.
      const upsertUnit = withRetry(async () => {
        const up = await supabase.storage.from('drive-files').upload(
          storagePath, file,
          {
            upsert: false,
            onUploadProgress: (ev) => ev.loaded && ev.total &&
              setProgress(p => ({ ...p, pct: Math.round(ev.loaded / ev.total * 100) })),
          }
        )
        if (up.error) throw up.error
        const ins = await supabase.from('files').insert({
          owner_id: user.id, folder_id: folderId, name,
          storage_path: storagePath, mime_type: file.type || null, size: file.size,
        })
        if (ins.error) {
          await supabase.storage.from('drive-files').remove([storagePath])
          throw ins.error
        }
        return null
      })
      try { await upsertUnit() }
      catch (e) { errs.push(`${file.name}: ${e.message}`) }
    }
    if (errs.length) setError(errs.join('\n'))
    setUploading(false)
    setProgress(null)
    load(activeFolder)
  }

  function onPickerChange(e) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file later
    uploadFiles(list)
  }

  // Drag-drop: read DataTransferItem entries (files + directories), recursing
  // into directories and giving each File a synthetic webkitRelativePath.
  function collectEntries(items) {
    const out = []
    const traverse = (entry, prefix) => new Promise((resolve) => {
      if (entry.isFile) {
        entry.file((f) => {
          Object.defineProperty(f, 'webkitRelativePath', { value: prefix ? `${prefix}/${f.name}` : f.name, configurable: true })
          out.push(f)
          resolve()
        }, () => resolve())
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const readAll = () => reader.readEntries(async (entries) => {
          if (!entries.length) return resolve()
          await Promise.all(entries.map(e => traverse(e, prefix ? `${prefix}/${entry.name}` : entry.name)))
          readAll()
        }, () => resolve())
        readAll()
      } else { resolve() }
    })
    return Promise.all(
      Array.from(items).filter(it => it.webkitGetAsEntry).map(it => {
        const entry = it.webkitGetAsEntry()
        return entry ? traverse(entry, '') : null
      }).filter(Boolean)
    ).then(() => out)
  }

  async function onDownload(file) {
    const { data, error } = await supabase.storage
      .from('drive-files')
      .createSignedUrl(file.storage_path, 60)
    if (error) { setError(error.message); return }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.download = file.name
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Collect a folder's subtree (the root + all descendants) plus all file rows
  // inside any subtree folder. Shared by folder delete and ZIP download.
  // ponytail: O(my items) per call (two whole-table owner-scoped queries).
  //   Switch to an RPC + recursive CTE returning only the subtree once a user
  //   has thousands of items.
  async function collectSubtree(rootId) {
    const [fRes, fileRes] = await Promise.all([
      supabase.from('folders').select('id, name, parent_folder_id').eq('owner_id', user.id),
      supabase.from('files').select('id, name, storage_path, folder_id').eq('owner_id', user.id),
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

  // Build a relative path for a file inside a subtree: walk folder_id up to
  // rootId (inclusive), collecting names.
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

  async function downloadZip() {
    const filesToZip = [] // { relPath, storagePath }
    const taken = new Set()
    const claim = (relPath) => {
      const lower = relPath.toLowerCase()
      if (!taken.has(lower)) { taken.add(lower); return relPath }
      const slash = relPath.lastIndexOf('/')
      const dir = slash >= 0 ? relPath.slice(0, slash + 1) : ''
      const base = slash >= 0 ? relPath.slice(slash + 1) : relPath
      const [stem, ext] = splitName(base)
      let n = 1, candidate
      do { candidate = dir + (ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`); n++ }
      while (taken.has(candidate.toLowerCase()))
      taken.add(candidate.toLowerCase())
      return candidate
    }

    // Directly selected files (at zip root by name).
    for (const id of selected.files) {
      const f = files.find(x => x.id === id)
      if (f) filesToZip.push({ relPath: claim(f.name), storagePath: f.storage_path })
    }
    // Each selected folder zipped as folderName/...
    for (const rootId of selected.folders) {
      const sub = await collectSubtree(rootId)
      if (sub.error) { setError(sub.error.message); return }
      for (const f of sub.filesInSubtree) {
        const rel = relPathInSubtree(f, rootId, sub.folderById)
        filesToZip.push({ relPath: claim(rel), storagePath: f.storage_path })
      }
    }
    if (!filesToZip.length) { setSelected({ files: new Set(), folders: new Set() }); return }

    setUploading(true)
    setProgress({ current: 0, total: filesToZip.length, name: 'downloading', pct: 0 })
    const errs = []
    const zip = new JSZip()
    for (let i = 0; i < filesToZip.length; i++) {
      const { relPath, storagePath } = filesToZip[i]
      setProgress({ current: i + 1, total: filesToZip.length, name: relPath, pct: 0 })
      const { data, error } = await supabase.storage.from('drive-files').download(storagePath)
      if (error) { errs.push(`${relPath}: ${error.message}`); continue }
      zip.file(relPath, data)
    }
    if (errs.length) { setError(errs.join('\n')) }
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
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }
    setUploading(false)
    setProgress(null)
    setSelected({ files: new Set(), folders: new Set() })
  }

  function requestRenameFile(file) {
    setModalName(file.name)
    setModal({ type: 'rename-file', file })
  }

  async function confirmRenameFile() {
    const file = modal.file
    const name = modalName.trim()
    if (!name || name === file.name) { setModal(null); return }
    // ponytail: rename is metadata-only; storage_path keeps {id} so the blob
    //   never moves. Display name and storage key are decoupled intentionally.
    const { error } = await supabase
      .from('files')
      .update({ name })
      .eq('id', file.id)
    if (error) { setError(error.message); return }
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, name } : f))
    setModal(null)
  }

  function requestDeleteFile(file) {
    setModal({ type: 'delete-file', file })
  }

  async function confirmDeleteFile() {
    const file = modal.file
    const rem = await supabase.storage
      .from('drive-files')
      .remove([file.storage_path])
    if (rem.error) { setError(rem.error.message); return }
    const { error } = await supabase.from('files').delete().eq('id', file.id)
    if (error) { setError(error.message); return }
    setFiles(prev => prev.filter(f => f.id !== file.id))
    setModal(null)
  }

  // --- folders ---------------------------------------------------------------
  function requestCreateFolder() {
    setModalName('')
    setModal({ type: 'create-folder' })
  }

  async function confirmCreateFolder() {
    const name = modalName.trim()
    if (!name) { setModal(null); return }
    const { error } = await supabase
      .from('folders')
      .insert({ owner_id: user.id, parent_folder_id: activeFolder, name })
    if (error) { setError(error.message); return }
    setModal(null)
    load(activeFolder)
  }

  function requestRenameFolder(folder) {
    setModalName(folder.name)
    setModal({ type: 'rename-folder', folder })
  }

  async function confirmRenameFolder() {
    const folder = modal.folder
    const name = modalName.trim()
    if (!name || name === folder.name) { setModal(null); return }
    const { error } = await supabase
      .from('folders')
      .update({ name })
      .eq('id', folder.id)
    if (error) { setError(error.message); return }
    setFolders(prev => prev.map(f => f.id === folder.id ? { ...f, name } : f))
    setModal(null)
  }

  function requestDeleteFolder(folder) {
    setModal({ type: 'delete-folder', folder })
  }

  async function confirmDeleteFolder() {
    const root = modal.folder
    // ponytail: O(my items) per delete; fine until thousands — then RPC +
    //   recursive CTE + security-definer cleanup function.
    const [fRes, fileRes] = await Promise.all([
      supabase.from('folders').select('id, parent_folder_id').eq('owner_id', user.id),
      supabase.from('files').select('id, storage_path, folder_id').eq('owner_id', user.id),
    ])
    if (fRes.error || fileRes.error) {
      setError((fRes.error || fileRes.error).message); return
    }
    // build descendant folder-id set (BFS over parent_folder_id)
    const byParent = new Map()
    for (const f of fRes.data) {
      const p = f.parent_folder_id ?? 'root'
      if (!byParent.has(p)) byParent.set(p, [])
      byParent.get(p).push(f.id)
    }
    const subtree = new Set([root.id])
    const queue = [root.id]
    while (queue.length) {
      const cur = queue.shift()
      for (const child of byParent.get(cur) ?? []) {
        if (!subtree.has(child)) { subtree.add(child); queue.push(child) }
      }
    }
    // collect storage paths of files inside any descendant folder (root included)
    const paths = fileRes.data
      .filter(fl => subtree.has(fl.folder_id))
      .map(fl => fl.storage_path)
    if (paths.length) {
      const rem = await supabase.storage.from('drive-files').remove(paths)
      if (rem.error) { setError(rem.error.message); return }
    }
    // cascade on folders.parent_folder_id + files.folder_id wipes all rows
    const { error } = await supabase.from('folders').delete().eq('id', root.id)
    if (error) { setError(error.message); return }
    setModal(null)
    load(activeFolder)
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="drive-page">
      <header className="drive-header">
        <div className="drive-header-left">
          <button
            className="drive-up"
            disabled={path.length === 0}
            onClick={() => navigateToFolder(path.length > 1 ? path[path.length - 2].id : null)}
            title="Up one level"
          >
            ↑
          </button>
          <Breadcrumb path={path} onNavigate={navigateToFolder} />
        </div>
        <div className="drive-header-actions">
          <button className="drive-signout" onClick={() => navigate('/profile')}>Profile</button>
          <button className="drive-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main
        className="drive-main"
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setDragging(true) }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setDragging(false) } }}
        onDrop={async (e) => {
          e.preventDefault(); dragCounter.current = 0; setDragging(false)
          if (uploading) return
          const list = await collectEntries(e.dataTransfer.items)
          uploadFiles(list)
        }}
      >
        <div className="drive-toolbar">
          <div className="drive-upload-wrap">
            <button
              className="drive-upload"
              disabled={uploading}
              onClick={() => setMenuOpen(o => !o)}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {menuOpen && !uploading && (
              <div className="drive-upload-menu" onMouseLeave={() => setMenuOpen(false)}>
                <button onClick={() => { setMenuOpen(false); fileInput.current?.click() }}>Files…</button>
                <button onClick={() => { setMenuOpen(false); folderInput.current?.click() }}>Folder…</button>
              </div>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="drive-upload-input"
            onChange={onPickerChange}
          />
          <input
            ref={el => { folderInput.current = el; if (el) el.setAttribute('webkitdirectory', '') }}
            type="file"
            multiple
            className="drive-upload-input"
            onChange={onPickerChange}
          />
          {progress && (
            <div className="drive-progress">
              <div className="drive-progress-meta">
                {progress.current}/{progress.total} — {progress.name}
              </div>
              <div className="drive-progress-bar"><div style={{ width: `${progress.pct}%` }} /></div>
            </div>
          )}
          <button className="drive-newfolder" onClick={requestCreateFolder}>New folder</button>
          {selected.files.size + selected.folders.size > 0 && (
            <button className="drive-upload" onClick={downloadZip} disabled={uploading}>
              Download ZIP ({selected.files.size + selected.folders.size})
            </button>
          )}
          {error && <pre className="drive-error">{error}</pre>}
        </div>
        {dragging && <div className="drive-drop-overlay">Drop to upload</div>}
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
          onOpenFolder={openFolder}
          onDownloadFile={onDownload}
          onRenameFile={requestRenameFile}
          onDeleteFile={requestDeleteFile}
          onRenameFolder={requestRenameFolder}
          onDeleteFolder={requestDeleteFolder}
        />
      </main>
      {modal?.type === 'rename-file' && (
        <Modal
          title="Rename file"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="modal-button" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="modal-button"
                onClick={confirmRenameFile}
                disabled={!modalName.trim() || modalName.trim() === modal.file.name}
              >
                Rename
              </button>
            </>
          }
        >
          <input
            className="modal-input"
            value={modalName}
            onChange={e => setModalName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmRenameFile() }}
          />
        </Modal>
      )}
      {modal?.type === 'delete-file' && (
        <Modal
          title="Delete file"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="modal-button" onClick={() => setModal(null)}>Cancel</button>
              <button className="modal-button modal-button-danger" onClick={confirmDeleteFile}>
                Delete
              </button>
            </>
          }
        >
          <p>Delete <strong>{modal.file.name}</strong>? This cannot be undone.</p>
        </Modal>
      )}
      {modal?.type === 'create-folder' && (
        <Modal
          title="New folder"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="modal-button" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="modal-button"
                onClick={confirmCreateFolder}
                disabled={!modalName.trim()}
              >
                Create
              </button>
            </>
          }
        >
          <input
            className="modal-input"
            value={modalName}
            onChange={e => setModalName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmCreateFolder() }}
            placeholder="Folder name"
          />
        </Modal>
      )}
      {modal?.type === 'rename-folder' && (
        <Modal
          title="Rename folder"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="modal-button" onClick={() => setModal(null)}>Cancel</button>
              <button
                className="modal-button"
                onClick={confirmRenameFolder}
                disabled={!modalName.trim() || modalName.trim() === modal.folder.name}
              >
                Rename
              </button>
            </>
          }
        >
          <input
            className="modal-input"
            value={modalName}
            onChange={e => setModalName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmRenameFolder() }}
          />
        </Modal>
      )}
      {modal?.type === 'delete-folder' && (
        <Modal
          title="Delete folder"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="modal-button" onClick={() => setModal(null)}>Cancel</button>
              <button className="modal-button modal-button-danger" onClick={confirmDeleteFolder}>
                Delete
              </button>
            </>
          }
        >
          <p>Delete <strong>{modal.folder.name}</strong> and everything inside it? This cannot be undone.</p>
        </Modal>
      )}
    </div>
  )
}