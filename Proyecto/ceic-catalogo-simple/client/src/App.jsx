import { useEffect, useState } from 'react'
import './App.css'
import logo from '/logo.png'

function App() {
  const [message, setMessage] = useState('Conectando...')
  const [activePage, setActivePage] = useState('Inicio')
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [token, setToken] = useState(localStorage.getItem('ceic_token') || '')
  const [adminName, setAdminName] = useState('')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    image: null
  })

  useEffect(() => {
    fetch('/api/test')
      .then(res => res.json())
      .then(data => setMessage(data.message))
      .catch(() => setMessage('Error de conexión'))
  }, [])

  useEffect(() => {
    const savedToken = localStorage.getItem('ceic_token')
    if (!savedToken) {
      setCheckingSession(false)
      return
    }

    fetch('/api/me', {
      headers: {
        Authorization: `Bearer ${savedToken}`
      }
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('No autorizado')
        const data = await res.json()
        setToken(savedToken)
        setAdminName(data.username)
      })
      .catch(() => {
        localStorage.removeItem('ceic_token')
        setToken('')
        setAdminName('')
      })
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    if (!token) return
    if (activePage === 'Taller 1') {
      fetchProducts()
    }
  }, [activePage, token])

  const fetchProducts = async () => {
    if (!token) return

    try {
      const response = await fetch('/api/products', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (response.status === 401) {
        handleLogout(false)
        return
      }

      const data = await response.json()
      setProducts(data)
    } catch (err) {
      console.error('Error al obtener productos:', err)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username,
          password: loginForm.password
        })
      })

      const data = await response.json()
      if (!response.ok) {
        setLoginError(data.error || 'Error al iniciar sesión')
        return
      }

      localStorage.setItem('ceic_token', data.token)
      setToken(data.token)
      setAdminName(data.username)
      setActivePage('Taller 1')
      setLoginForm({ username: '', password: '' })
      setLoginError('')
    } catch (err) {
      setLoginError('Error de conexión con el servidor')
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = async (withRequest = true) => {
    if (withRequest && token) {
      try {
        await fetch('/api/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
      } catch (err) {
        console.error('Error al cerrar sesión:', err)
      }
    }

    localStorage.removeItem('ceic_token')
    setToken('')
    setAdminName('')
    setProducts([])
    setShowModal(false)
    setActivePage('Inicio')
  }

  const handleCreateProduct = async (e) => {
    e.preventDefault()
    if (!token) return

    const formDataToSend = new FormData()
    formDataToSend.append('name', formData.name)
    formDataToSend.append('description', formData.description)
    formDataToSend.append('price', formData.price)
    if (formData.image) {
      formDataToSend.append('image', formData.image)
    }

    try {
      const response = await fetch('/api/products', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formDataToSend
      })

      if (response.status === 401) {
        handleLogout(false)
        return
      }

      const data = await response.json()
      setProducts([data, ...products])
      setShowModal(false)
      setFormData({ name: '', description: '', price: '', image: null })
    } catch (err) {
      console.error('Error al crear producto:', err)
    }
  }

  const menuItems = ['Inicio', 'Taller 1', 'Taller 2', 'Taller 3', 'Taller 4']

  if (!token && !checkingSession) {
    return (
      <div className="login-page">
        <div className="login-card">
          <img src={logo} alt="CEIC Logo" className="login-logo" />
          <h2>Acceso Administrador</h2>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="username">Usuario:</label>
              <input
                id="username"
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                autoComplete="username"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Contraseña:</label>
              <input
                id="password"
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                autoComplete="current-password"
                required
              />
            </div>
            {loginError && <p className="login-error">{loginError}</p>}
            <button type="submit" className="login-btn" disabled={loginLoading}>
              {loginLoading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <img src={logo} alt="CEIC Logo" className="logo" />
          <nav className="nav-menu">
            {menuItems.map((item) => (
              <button
                key={item}
                className={`nav-item ${activePage === item ? 'active' : ''}`}
                onClick={() => setActivePage(item)}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="admin-session">
            {adminName && <span className="admin-name">{adminName}</span>}
            <button className="logout-btn" onClick={() => handleLogout()}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="content-area">
          <h1>{activePage}</h1>

          {activePage === 'Inicio' && (
            <p className="connection-status">{message}</p>
          )}

          {activePage === 'Taller 1' && (
            <div className="taller-content">
              <button
                className="create-product-btn"
                onClick={() => setShowModal(true)}
              >
                + Crear Producto
              </button>

              <div className="products-grid">
                {products.map((product) => (
                  <div key={product.id} className="product-card">
                    {product.image && (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="product-image"
                      />
                    )}
                    <div className="product-info">
                      <h3 className="product-name">{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                      <p className="product-price">${Number(product.price).toLocaleString('es-CL')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activePage !== 'Inicio' && activePage !== 'Taller 1' && (
            <p className="connection-status">Sección en desarrollo</p>
          )}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Crear Producto</h2>
            <form onSubmit={handleCreateProduct}>
              <div className="form-group">
                <label>Nombre:</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Descripción:</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Precio:</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Imagen:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormData({ ...formData, image: e.target.files[0] })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit">Crear</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
