import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import JSZip from 'jszip'
import { useCallback, useEffect, useState } from 'react'
import './Shared.css'

export default function Shared() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [folders, setFolders] = useState([])
  const [owners, setOwners] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    // List direct inbound shares (recipient-only select policy).
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
        ? supabase.from('folders').select('id, name, owner_id, created_at').in('id', folderIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (fRes.error) { setError(fRes.error.message); setLoading(false); return }
    if (foRes.error) { setError(foRes.error.message); setLoading(false); return }
    setFiles(fRes.data ?? [])
    setFolders(foRes.data ?? [])
    // Resolve owner usernames in one batch so the list shows who shared.
    const ownerIds = Array.from(new Set([
      ...(fRes.data ?? []).map(f => f.owner_id),
      ...(foRes.data ?? []).map(f => f.owner_id),
    ]))
    if (ownerIds.length) {
      const { data: names } = await supabase.rpc('usernames_for_users', { p_ids: ownerIds })
      const m = {}
      for (const n of names ?? []) m[n.id] = n.username ?? '(unknown)'
      setOwners(m)
    } else {
      setOwners({})
    }
    setLoading(false)
  }, [user.id])

  useEffect(() => { load() }, [load])

  async function onDownloadFile(file) {
    setError('')
    const { data, error } = await supabase.rpc('create_share_download_url', { p_file: file.id })
    if (error || !data) { setError(error?.message ?? 'Download failed'); return }
    const a = document.createElement('a')
    a.href = data
    a.download = file.name
    a.target = '_blank'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Walk a shared folder's subtree using global queries (no owner filter —
  // RLS admits descendants via the recursive folder_is_shared_with_me helper).
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

  async function onDownloadFolderZip(folder) {
    setError('')
    const sub = await collectSubtree(folder.id)
    if (sub.error) { setError(sub.error.message); return }
    if (!sub.filesInSubtree.length) { setError('Folder is empty'); return }
    setBusy(true)
    setProgress({ current: 0, total: sub.filesInSubtree.length, name: 'downloading', pct: 0 })
    const errs = []
    const zip = new JSZip()
    const taken = new Set()
    for (let i = 0; i < sub.filesInSubtree.length; i++) {
      const f = sub.filesInSubtree[i]
      const rel = relPathInSubtree(f, folder.id, sub.folderById)
      // ponytail: no de-dupe inside the zip; shared subtrees are owner-curated
      //   so collisions are unlikely. Add if needed.
      setProgress({ current: i + 1, total: sub.filesInSubtree.length, name: rel, pct: 0 })
      const { data: url, error } = await supabase.rpc('create_share_download_url', { p_file: f.id })
      if (error || !url) { errs.push(`${rel}: ${error?.message ?? 'failed'}`); continue }
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        zip.file(rel, blob)
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
      a.href = url
      a.download = `${folder.name}.zip`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    }
    setBusy(false)
    setProgress(null)
  }

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="shared-page">
      <header className="shared-header">
        <div className="shared-header-left">
          <button className="shared-up" onClick={() => navigate('/drive')} title="Back to my drive">←</button>
          <h1 className="shared-title">Shared with me</h1>
        </div>
        <div className="shared-header-actions">
          <button className="shared-signout" onClick={() => navigate('/profile')}>Profile</button>
          <button className="shared-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="shared-main">
        {progress && (
          <div className="shared-progress">
            <div className="shared-progress-meta">
              Download {progress.current}/{progress.total} — {progress.name}
            </div>
            <div className="shared-progress-bar"><div style={{ width: `${progress.pct}%` }} /></div>
          </div>
        )}
        {error && <pre className="shared-error">{error}</pre>}
        {loading
          ? <div className="shared-loading">Loading…</div>
          : !files.length && !folders.length
            ? <div className="shared-empty">Nothing has been shared with you yet.</div>
            : (
              <div className="shared-list">
                {folders.map(f => (
                  <div key={f.id} className="shared-row shared-row-folder">
                    <span className="shared-icon" aria-hidden>📁</span>
                    <span className="shared-name">{f.name}</span>
                    <span className="shared-owner">from {owners[f.owner_id] ?? '…'}</span>
                    <span className="shared-actions">
                      <button
                        className="shared-action"
                        onClick={() => onDownloadFolderZip(f)}
                        disabled={busy}
                        title="Download as ZIP"
                      >⬇</button>
                    </span>
                  </div>
                ))}
                {files.map(f => (
                  <div key={f.id} className="shared-row shared-row-file">
                    <span className="shared-icon" aria-hidden>📄</span>
                    <span className="shared-name">{f.name}</span>
                    <span className="shared-owner">from {owners[f.owner_id] ?? '…'}</span>
                    <span className="shared-actions">
                      <button
                        className="shared-action"
                        onClick={() => onDownloadFile(f)}
                        disabled={busy}
                        title="Download"
                      >⬇</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
      </main>
    </div>
  )
}