import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
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

  async function onUploadChange(e) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = '' // allow re-selecting the same file later
    if (!list.length) return
    setError('')
    setUploading(true)
    const errs = []
    for (const file of list) {
      if (file.size > MAX_FILE_SIZE) {
        errs.push(`${file.name}: exceeds 50 MB`)
        continue
      }
      const fileId = crypto.randomUUID()
      const storagePath = `${user.id}/${fileId}/${file.name}`
      const up = await supabase.storage
        .from('drive-files')
        .upload(storagePath, file, { upsert: false })
      if (up.error) { errs.push(`${file.name}: ${up.error.message}`); continue }
      const ins = await supabase.from('files').insert({
        owner_id: user.id,
        folder_id: activeFolder,
        name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size: file.size,
      })
      if (ins.error) {
        // ponytail: best-effort rollback of the uploaded blob if the row insert
        //   fails; not transactional, but keeps storage from accumulating orphans.
        await supabase.storage.from('drive-files').remove([storagePath])
        errs.push(`${file.name}: ${ins.error.message}`)
      }
    }
    if (errs.length) setError(errs.join('\n'))
    setUploading(false)
    load(activeFolder)
  }

  async function findFolder(parent, name) {
    let q = supabase.from('folders').select('id').eq('owner_id', user.id).ilike('name', name)
    if (parent) q = q.eq('parent_folder_id', parent)
    else q = q.is('parent_folder_id', null)
    const { data } = await q.maybeSingle()
    return data?.id ?? null
  }

  async function onFolderUploadChange(e) {
    const list = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!list.length) return
    setError('')
    setUploading(true)
    const errs = []

    // Collect unique folder directory paths (everything but the last segment of
    // webkitRelativePath), shallow → deep so parents are created first.
    const dirPaths = Array.from(new Set(
      list.map(f => f.webkitRelativePath || f.name).map(p => p.split('/').slice(0, -1).join('/')).filter(Boolean)
    )).sort((a, b) => a.split('/').length - b.split('/').length)

    // Find-or-create each dir path under activeFolder. Cache by "parentId|name".
    // ponytail: N folder-select queries per upload (N = unique path segments).
    //   Fine until thousands of folders; then a single RPC returning parent chains.
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

    for (const file of list) {
      if (file.size > MAX_FILE_SIZE) {
        errs.push(`${file.name}: exceeds 50 MB`); continue
      }
      const dp = (file.webkitRelativePath || file.name).split('/').slice(0, -1).join('/')
      let folderId = activeFolder
      let parent = activeFolder
      for (const seg of dp ? dp.split('/') : []) {
        folderId = dirId.get(`${parent ?? 'root'}|${seg}`)
        parent = folderId
      }
      const fileId = crypto.randomUUID()
      const storagePath = `${user.id}/${fileId}/${file.name}`
      const up = await supabase.storage.from('drive-files').upload(storagePath, file, { upsert: false })
      if (up.error) { errs.push(`${file.name}: ${up.error.message}`); continue }
      const ins = await supabase.from('files').insert({
        owner_id: user.id, folder_id: folderId, name: file.name,
        storage_path: storagePath, mime_type: file.type || null, size: file.size,
      })
      if (ins.error) {
        // ponytail: best-effort blob rollback on row-insert failure (no transaction).
        await supabase.storage.from('drive-files').remove([storagePath])
        errs.push(`${file.name}: ${ins.error.message}`)
      }
    }
    if (errs.length) setError(errs.join('\n'))
    setUploading(false)
    load(activeFolder)
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
      <main className="drive-main">
        <div className="drive-toolbar">
          <button
            className="drive-upload"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload files'}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="drive-upload-input"
            onChange={onUploadChange}
          />
          <button
            className="drive-upload"
            disabled={uploading}
            onClick={() => folderInput.current?.click()}
          >
            {uploading ? 'Uploading…' : 'Upload folder'}
          </button>
          <input
            ref={el => { folderInput.current = el; if (el) el.setAttribute('webkitdirectory', '') }}
            type="file"
            multiple
            className="drive-upload-input"
            onChange={onFolderUploadChange}
          />
          <button className="drive-newfolder" onClick={requestCreateFolder}>New folder</button>
          {error && <pre className="drive-error">{error}</pre>}
        </div>
        <FileList
          folders={folders}
          files={files}
          loading={loading}
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