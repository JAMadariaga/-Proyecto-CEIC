import './App.css'
import './extra.css'
import Catalog from './Catalog'
import Admin from './Admin'

// catalogo publico, "/admin" = panel de administración
function App() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path.startsWith('/admin') ? <Admin /> : <Catalog />
}

export default App