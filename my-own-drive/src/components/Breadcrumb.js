export default function Breadcrumb({ path, onNavigate }) {
  return (
    <nav className="breadcrumb">
      <button className="breadcrumb-crumb" onClick={() => onNavigate(null)}>My drive</button>
      {path.map(f => (
        <span key={f.id} className="breadcrumb-item">
          <span className="breadcrumb-sep">/</span>
          <button className="breadcrumb-crumb" onClick={() => onNavigate(f.id)}>{f.name}</button>
        </span>
      ))}
    </nav>
  )
}