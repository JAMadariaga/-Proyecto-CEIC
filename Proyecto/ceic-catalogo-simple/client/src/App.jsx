import { useEffect, useState } from 'react'
import './App.css'
import logo from '/logo.png'

function App() {
  const [message, setMessage] = useState('Conectando...')
  const [activePage, setActivePage] = useState('Inicio')
  const [products, setProducts] = useState([])
  const [showModal, setShowModal] = useState(false)
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
      .catch(err => setMessage('Error de conexión'))
  }, [])

  useEffect(() => {
    if (activePage === 'Taller 1') {
      fetchProducts()
    }
  }, [activePage])

  const fetchProducts = async () => {
    try {
      const response = await fetch('/api/products')
      const data = await response.json()
      setProducts(data)
    } catch (err) {
      console.error('Error al obtener productos:', err)
    }
  }

  const handleCreateProduct = async (e) => {
    e.preventDefault()
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
        body: formDataToSend
      })
      const data = await response.json()
      setProducts([data, ...products])
      setShowModal(false)
      setFormData({ name: '', description: '', price: '', image: null })
    } catch (err) {
      console.error('Error al crear producto:', err)
    }
  }

  const menuItems = ['Inicio', 'Taller 1', 'Taller 2', 'Taller 3', 'Taller 4']

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
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Descripción:</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Precio:</label>
                <input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({...formData, price: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Imagen:</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setFormData({...formData, image: e.target.files[0]})}
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
