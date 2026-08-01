import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { useEffect, useState } from 'react'
import Breadcrumb from '../components/Breadcrumb'
import FileList from '../components/FileList'
import './Drive.css'

export default function Drive() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [activeFolder, setActiveFolder] = useState(null)
  const [path, setPath] = useState([])
  const [folders, setFolders] = useState([])
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [fRes, fileRes] = await Promise.all([
        supabase
          .from('folders')
          .select('id, name, created_at, parent_folder_id')
          .eq('owner_id', user.id)
          .eq('parent_folder_id', activeFolder ?? '')
          .order('name', { ascending: true }),
        supabase
          .from('files')
          .select('id, name, size, mime_type, created_at')
          .eq('owner_id', user.id)
          .eq('folder_id', activeFolder ?? '')
          .order('name', { ascending: true }),
      ])
      if (cancelled) return
      setFolders(fRes.data ?? [])
      setFiles(fileRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user.id, activeFolder])

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
    // rebuild breadcrumb by walking parent chain from the clicked folder
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

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="drive-page">
      <header className="drive-header">
        <Breadcrumb path={path} onNavigate={navigateToFolder} />
        <div className="drive-header-actions">
          <button className="drive-signout" onClick={() => navigate('/profile')}>Profile</button>
          <button className="drive-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="drive-main">
        <FileList folders={folders} files={files} loading={loading} onOpenFolder={openFolder} />
      </main>
    </div>
  )
}