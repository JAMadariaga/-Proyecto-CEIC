import './App.css'
import './extra.css'
import Catalog from './Catalog'
import Manager from './Manager'

// catalogo publico, "/admin" = panel de administración
function App() {
  const path = window.location.pathname.replace(/\/+$/, '')
  return path.startsWith('/admin') ? <Manager /> : <Catalog />
}

export default App