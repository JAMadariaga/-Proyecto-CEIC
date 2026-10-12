import { useEffect, useState } from 'react'
import logo from '/logo.png'
import { TALLERES, NOMBRES_TALLER, ICONOS_TALLER, formatPrecio } from './talleres'

function Catalog() {
  const [products, setProducts] = useState([])
  const [filter, setFilter] = useState('todos')
  const [status, setStatus] = useState('loading') // loading | ok | error

  const loadProducts = () => {
    setStatus('loading')
    fetch('/api/products')
      .then((res) => {
        if (!res.ok) throw new Error('Error al cargar')
        return res.json()
      })
      .then((data) => {
        setProducts(data)
        setStatus('ok')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const visibles =
    filter === 'todos' ? products : products.filter((p) => p.taller === filter)

  return (
    <div className="pub-page">
      <header className="pub-header">
        <div className="pub-header-inner">
          <img src={logo} alt="Logo del CEIC" className="pub-logo" />
          <div>
            <h1>Catálogo de productos</h1>
            <p>Talleres laborales del Centro Educativo Integral de Curicó</p>
          </div>
        </div>
      </header>

      <main className="pub-main">
        <nav className="pub-filters" aria-label="Filtrar por taller">
          <button
            className={`pub-filter ${filter === 'todos' ? 'active' : ''}`}
            aria-pressed={filter === 'todos'}
            onClick={() => setFilter('todos')}
          >
            <span aria-hidden="true">⭐</span> Todos
          </button>
          {TALLERES.map((t) => (
            <button
              key={t}
              className={`pub-filter ${filter === t ? 'active' : ''}`}
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
            >
              <span aria-hidden="true">{ICONOS_TALLER[t]}</span> {NOMBRES_TALLER[t]}
            </button>
          ))}
        </nav>

        {status === 'loading' && (
          <p className="pub-message" role="status">
            Cargando productos... puede tardar unos segundos.
          </p>
        )}

        {status === 'error' && (
          <div className="pub-message" role="alert">
            <p>No pudimos cargar los productos.</p>
            <button className="pub-retry" onClick={loadProducts}>
              Intentar de nuevo
            </button>
          </div>
        )}

        {status === 'ok' && visibles.length === 0 && (
          <p className="pub-message">Todavía no hay productos en esta sección.</p>
        )}

        {status === 'ok' && visibles.length > 0 && (
          <div className="pub-grid">
            {visibles.map((product) => (
              <article key={product.id} className="pub-card">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="pub-image"
                    loading="lazy"
                  />
                ) : (
                  <div className="pub-image pub-image-empty" aria-hidden="true">
                    {ICONOS_TALLER[product.taller] || '🛍️'}
                  </div>
                )}
                <div className="pub-card-body">
                  {product.taller && (
                    <span className="pub-badge">
                      <span aria-hidden="true">{ICONOS_TALLER[product.taller]}</span>{' '}
                      {NOMBRES_TALLER[product.taller]}
                    </span>
                  )}
                  <h2 className="pub-name">{product.name}</h2>
                  {product.description && <p className="pub-desc">{product.description}</p>}
                  <p className="pub-price">{formatPrecio(product.price)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="pub-footer">
        <a href="/admin">Acceso administrador</a>
      </footer>
    </div>
  )
}

export default Catalog