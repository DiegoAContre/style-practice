import './Breadcrumb.css'

export default function Breadcrumb({ path, onNavigate, rootLabel = 'My drive' }) {
  return (
    <nav className="breadcrumb">
      <button className="breadcrumb-crumb" onClick={() => onNavigate(null)}>{rootLabel}</button>
      {path.map(f => (
        <span key={f.id} className="breadcrumb-item">
          <span className="breadcrumb-sep">/</span>
          <button className="breadcrumb-crumb" onClick={() => onNavigate(f.id)}>{f.name}</button>
        </span>
      ))}
    </nav>
  )
}