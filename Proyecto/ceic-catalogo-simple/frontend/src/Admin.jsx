import { useEffect, useRef, useState } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import logo from '/logo.png'
import { TALLERES, NOMBRES_TALLER, formatPrecio } from './talleres'

const FORM_VACIO = { name: '', description: '', price: '', image: null }

function Admin() {
  const [message, setMessage] = useState('Conectando...')
  const [activePage, setActivePage] = useState('Inicio') // 'Inicio' o el id de un taller
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [qrSource, setQrSource] = useState('feria')
  const qrCanvasRef = useRef(null)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null) // null = creando
  const [token, setToken] = useState(localStorage.getItem('ceic_token') || '')
  const [adminName, setAdminName] = useState('')
  const [loginForm, setLoginForm] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [formData, setFormData] = useState(FORM_VACIO)

  const isTaller = TALLERES.includes(activePage)
  const qrValue = `${window.location.origin}/qr?src=${encodeURIComponent(qrSource.trim() || 'general')}`

  const downloadQr = () => {
    const canvas = qrCanvasRef.current
    if (!canvas) return
    const anchor = document.createElement('a')
    const filenameSource = (qrSource.trim() || 'general').replace(/[^a-z0-9_-]/gi, '-')
    anchor.href = canvas.toDataURL('image/png')
    anchor.download = `catalogo-qr-${filenameSource}.png`
    anchor.click()
  }

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
      headers: { Authorization: `Bearer ${savedToken}` }
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
    if (TALLERES.includes(activePage)) {
      setProducts([])
      fetchProducts()
    }
  }, [activePage])

  // Estadísticas del QR (se muestran en Inicio)
  useEffect(() => {
    if (!token || activePage !== 'Inicio') return
    fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null))
  }, [token, activePage])

  const fetchProducts = async () => {
    try {
      const response = await fetch(`/api/products?taller=${activePage}`)
      if (!response.ok) throw new Error('Error al obtener productos')
      setProducts(await response.json())
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
      setActivePage(TALLERES[0])
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
          headers: { Authorization: `Bearer ${token}` }
        })
      } catch (err) {
        console.error('Error al cerrar sesión:', err)
      }
    }

    localStorage.removeItem('ceic_token')
    setToken('')
    setAdminName('')
    setProducts([])
    closeModal()
    setActivePage('Inicio')
  }

  const openCreate = () => {
    setEditingProduct(null)
    setFormData(FORM_VACIO)
    setShowModal(true)
  }

  const openEdit = (product) => {
    setEditingProduct(product)
    setFormData({
      name: product.name,
      description: product.description || '',
      price: String(product.price),
      image: null
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingProduct(null)
    setFormData(FORM_VACIO)
  }

  // Sirve para crear y para editar
  const handleSubmitProduct = async (e) => {
    e.preventDefault()
    if (!token) return

    const isEdit = Boolean(editingProduct)

    const formDataToSend = new FormData()
    formDataToSend.append('name', formData.name)
    formDataToSend.append('description', formData.description)
    formDataToSend.append('price', formData.price)
    formDataToSend.append('taller', (isEdit && editingProduct.taller) || activePage)
    if (formData.image) {
      formDataToSend.append('image', formData.image)
    }

    try {
      const response = await fetch(
        isEdit ? `/api/products/${editingProduct.id}` : '/api/products',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formDataToSend
        }
      )

      if (response.status === 401) {
        handleLogout(false)
        return
      }

      const data = await response.json()
      if (!response.ok) {
        alert(data.error || 'No se pudo guardar el producto')
        return
      }

      if (isEdit) {
        setProducts(products.map((p) => (p.id === data.id ? data : p)))
      } else {
        setProducts([data, ...products])
      }
      closeModal()
    } catch (err) {
      console.error('Error al guardar producto:', err)
      alert('Error de conexión con el servidor')
    }
  }

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`)) return

    try {
      const response = await fetch(`/api/products/${product.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.status === 401) {
        handleLogout(false)
        return
      }

      if (!response.ok) {
        const data = await response.json()
        alert(data.error || 'No se pudo eliminar el producto')
        return
      }

      setProducts(products.filter((p) => p.id !== product.id))
    } catch (err) {
      console.error('Error al eliminar producto:', err)
      alert('Error de conexión con el servidor')
    }
  }

  const menuItems = [
    { id: 'Inicio', label: 'Inicio' },
    ...TALLERES.map((t) => ({ id: t, label: NOMBRES_TALLER[t] }))
  ]

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
          <p className="login-back">
            <a href="/">← Volver al catálogo</a>
          </p>
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
                key={item.id}
                className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                onClick={() => setActivePage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="admin-session">
            <a className="view-catalog" href="/" target="_blank" rel="noreferrer">
              Ver catálogo
            </a>
            {adminName && <span className="admin-name">{adminName}</span>}
            <button className="logout-btn" onClick={() => handleLogout()}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="content-area">
          <h1>{isTaller ? NOMBRES_TALLER[activePage] : activePage}</h1>

          {activePage === 'Inicio' && (
            <>
              <p className="connection-status">{message}</p>

              <div className="stats-card">
                <h2>Código QR</h2>
                <div className="qr-generator">
                  <div className="qr-preview">
                    <QRCodeCanvas ref={qrCanvasRef} value={qrValue} size={216} level="H" marginSize={2} />
                  </div>
                  <div className="qr-controls">
                    <label htmlFor="qr-source">Origen del QR</label>
                    <input
                      id="qr-source"
                      type="text"
                      value={qrSource}
                      maxLength={50}
                      onChange={(event) => setQrSource(event.target.value)}
                    />
                    <p className="stats-link">{qrValue}</p>
                    <button className="qr-download" onClick={downloadQr}>
                      Descargar QR en PNG
                    </button>
                  </div>
                </div>
                {stats ? (
                  <>
                    <p className="stats-number">{stats.qrScans}</p>
                    <p className="stats-label">escaneos registrados</p>
                    {stats.bySource.length > 0 && (
                      <ul className="stats-list">
                        {stats.bySource.map((s) => (
                          <li key={s.source}>
                            {s.source}: {s.total}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <p className="stats-label">Cargando estadísticas...</p>
                )}
              </div>
            </>
          )}

          {isTaller && (
            <div className="taller-content">
              <button className="create-product-btn" onClick={openCreate}>
                + Crear Producto
              </button>

              {products.length === 0 && (
                <p className="connection-status">Aún no hay productos en este taller.</p>
              )}

              <div className="products-grid">
                {products.map((product) => (
                  <div key={product.id} className="product-card">
                    {product.image_url && (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="product-image"
                      />
                    )}
                    <div className="product-info">
                      <h3 className="product-name">{product.name}</h3>
                      <p className="product-description">{product.description}</p>
                      <p className="product-price">{formatPrecio(product.price)}</p>
                    </div>
                    <div className="product-actions">
                      <button className="edit-btn" onClick={() => openEdit(product)}>
                        Editar
                      </button>
                      <button className="delete-btn" onClick={() => handleDeleteProduct(product)}>
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>{editingProduct ? 'Editar Producto' : 'Crear Producto'}</h2>
            <form onSubmit={handleSubmitProduct}>
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
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>
                  {editingProduct ? 'Imagen (déjala vacía para conservar la actual):' : 'Imagen:'}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormData({ ...formData, image: e.target.files[0] })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeModal}>Cancelar</button>
                <button type="submit">{editingProduct ? 'Guardar cambios' : 'Crear'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Admin