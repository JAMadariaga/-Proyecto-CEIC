import { useEffect, useMemo, useState } from 'react'
import logo from '/logo.png'
import { formatPrecio } from './talleres'

const EMPTY_FORM = { nombre: '', apellido: '', correo: '', password: '', id_taller: '', descripcion: '', direccion: '', name: '', description: '', price: '', stock: '0', workshop_id: '', image: null, activo: true }

async function responseData(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'No se pudo completar la operación')
  return data
}

async function requestApi(token, url, options = {}) {
  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
  return responseData(await fetch(url, { ...options, headers }))
}

function Manager() {
  const [token, setToken] = useState(localStorage.getItem('ceic_token') || '')
  const [profile, setProfile] = useState(null)
  const [checking, setChecking] = useState(Boolean(localStorage.getItem('ceic_token')))
  const [login, setLogin] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [section, setSection] = useState('dashboard')
  const [workshops, setWorkshops] = useState([])
  const [users, setUsers] = useState([])
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState(null)
  const [search, setSearch] = useState('')
  const [workshopFilter, setWorkshopFilter] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!token) return
    requestApi(token, '/api/me')
      .then((data) => {
        setProfile(data)
        setSection(data.role === 'admin' ? 'dashboard' : 'workshop')
      })
      .catch(() => {
        localStorage.removeItem('ceic_token')
        setToken('')
        setProfile(null)
      })
      .finally(() => setChecking(false))
  }, [token])

  useEffect(() => {
    if (!profile || profile.role !== 'admin') return
    Promise.all([
      requestApi(token, '/api/admin/workshops'),
      requestApi(token, '/api/admin/users'),
      requestApi(token, '/api/admin/products'),
      requestApi(token, '/api/admin/stats'),
    ]).then(([nextWorkshops, nextUsers, nextProducts, nextStats]) => {
      setWorkshops(nextWorkshops)
      setUsers(nextUsers)
      setProducts(nextProducts)
      setStats(nextStats)
    }).catch((error) => setNotice(error.message)).finally(() => setLoadingData(false))
  }, [profile, token])

  useEffect(() => {
    if (profile?.role !== 'user' || !profile.workshop) return
    requestApi(token, '/api/my/products')
      .then(setProducts)
      .catch((error) => setNotice(error.message))
      .finally(() => setLoadingData(false))
  }, [profile, token])

  const filteredWorkshops = useMemo(() => workshops.filter((item) =>
    `${item.nombre} ${item.descripcion || ''}`.toLowerCase().includes(search.toLowerCase())), [workshops, search])
  const filteredUsers = useMemo(() => users.filter((item) =>
    `${item.nombre} ${item.apellido || ''} ${item.correo} ${item.taller_nombre || ''}`.toLowerCase().includes(search.toLowerCase())), [users, search])
  const filteredProducts = useMemo(() => products.filter((item) => {
    const matchesText = `${item.name} ${item.description || ''} ${item.workshop_name || ''}`.toLowerCase().includes(search.toLowerCase())
    const matchesWorkshop = !workshopFilter || String(item.workshop_id) === workshopFilter
    return matchesText && matchesWorkshop
  }), [products, search, workshopFilter])

  const refresh = async (type) => {
    if (type === 'workshops' || type === 'all') setWorkshops(await requestApi(token, '/api/admin/workshops'))
    if (type === 'users' || type === 'all') setUsers(await requestApi(token, '/api/admin/users'))
    if (type === 'products' || type === 'all') setProducts(await requestApi(token, profile?.role === 'admin' ? '/api/admin/products' : '/api/my/products'))
    if (type === 'stats' || type === 'all') setStats(await requestApi(token, '/api/admin/stats'))
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    setLoginError('')
    setBusy(true)
    try {
      const data = await responseData(await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(login),
      }))
      localStorage.setItem('ceic_token', data.token)
      setToken(data.token)
      setLogin({ username: '', password: '' })
      const me = await responseData(await fetch('/api/me', { headers: { Authorization: `Bearer ${data.token}` } }))
      setProfile(me)
      setSection(me.role === 'admin' ? 'dashboard' : 'workshop')
    } catch (error) {
      setLoginError(error.message || 'No se pudo iniciar sesión')
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    try { await requestApi(token, '/api/logout', { method: 'POST' }) } catch { /* token is removed locally either way */ }
    localStorage.removeItem('ceic_token')
    setToken('')
    setProfile(null)
    setProducts([])
    setUsers([])
    setWorkshops([])
  }

  const openForm = (type, item = null) => {
    const initial = { ...EMPTY_FORM }
    if (type === 'workshop' && item) Object.assign(initial, { nombre: item.nombre, descripcion: item.descripcion || '', direccion: item.direccion || '', activo: item.activo })
    if (type === 'user' && item) Object.assign(initial, { nombre: item.nombre, apellido: item.apellido || '', correo: item.correo, id_taller: item.id_taller || '', activo: item.activo })
    if (type === 'product' && item) Object.assign(initial, { name: item.name, description: item.description || '', price: String(item.price), stock: String(item.stock || 0), workshop_id: String(item.workshop_id), image: null })
    if (type === 'product' && !item && profile?.role === 'user') initial.workshop_id = String(profile.workshop?.id_taller || '')
    setForm(initial)
    setModal({ type, item })
    setNotice('')
  }

  const saveForm = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      const { type, item } = modal
      let url
      let method
      let body
      if (type === 'workshop') {
        url = item ? `/api/admin/workshops/${item.id_taller}` : '/api/admin/workshops'
        method = item ? 'PUT' : 'POST'
        body = JSON.stringify({ nombre: form.nombre, descripcion: form.descripcion, direccion: form.direccion, activo: form.activo })
      } else if (type === 'user') {
        url = item ? `/api/admin/users/${item.id_usuario}` : '/api/admin/users'
        method = item ? 'PUT' : 'POST'
        body = JSON.stringify({ nombre: form.nombre, apellido: form.apellido, correo: form.correo, password: form.password, id_taller: form.id_taller || null, activo: form.activo })
      } else {
        const fields = new FormData()
        fields.append('name', form.name)
        fields.append('description', form.description)
        fields.append('price', form.price)
        fields.append('stock', form.stock)
        if (profile.role === 'admin') fields.append('workshop_id', form.workshop_id)
        if (form.image) fields.append('image', form.image)
        url = profile.role === 'admin'
          ? (item ? `/api/products/${item.id}` : '/api/products')
          : (item ? `/api/my/products/${item.id}` : '/api/my/products')
        method = item ? 'PUT' : 'POST'
        body = fields
      }
      await requestApi(token, url, { method, body })
      await refresh(type === 'workshop' ? 'workshops' : type === 'user' ? 'users' : 'products')
      if (profile.role === 'admin') await refresh('stats')
      setModal(null)
      setNotice('Cambios guardados correctamente')
    } catch (error) {
      setNotice(error.message)
    } finally {
      setBusy(false)
    }
  }

  const removeItem = async (type, item) => {
    const label = type === 'workshop' ? item.nombre : type === 'user' ? `${item.nombre} ${item.apellido || ''}` : item.name
    const consequence = type === 'workshop'
      ? ` Los usuarios asignados quedarán sin taller.${item.productos ? ' Como tiene productos, el servidor rechazará la eliminación.' : ''}`
      : ' Esta acción no se puede deshacer.'
    if (!window.confirm(`¿Eliminar ${label.trim()}?${consequence}`)) return
    const url = type === 'workshop'
      ? `/api/admin/workshops/${item.id_taller}`
      : type === 'user'
        ? `/api/admin/users/${item.id_usuario}`
        : profile.role === 'admin' ? `/api/products/${item.id}` : `/api/my/products/${item.id}`
    try {
      await requestApi(token, url, { method: 'DELETE' })
      await refresh(type === 'workshop' ? 'workshops' : type === 'user' ? 'users' : 'products')
      if (profile.role === 'admin') await refresh('stats')
      setNotice('Registro eliminado')
    } catch (error) {
      setNotice(error.message)
    }
  }

  if (checking) return <main className="manager-loading">Verificando sesión...</main>
  if (!profile) return (
    <main className="manager-login">
      <form className="manager-login-panel" onSubmit={handleLogin}>
        <a href="/" className="manager-back">← Catálogo</a>
        <img src={logo} alt="Logo CEIC" />
        <p className="manager-eyebrow">CEIC · GESTIÓN</p>
        <h1>Iniciar sesión</h1>
        <label>Correo o usuario<input type="text" autoComplete="username" value={login.username} onChange={(event) => setLogin({ ...login, username: event.target.value })} required /></label>
        <label>Contraseña<input type="password" autoComplete="current-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} required /></label>
        {loginError && <p className="manager-error" role="alert">{loginError}</p>}
        <button className="manager-primary" disabled={busy}>{busy ? 'Ingresando...' : 'Ingresar'}</button>
      </form>
    </main>
  )

  if (profile.role === 'user' && !profile.workshop) return (
    <main className="manager-login"><section className="manager-login-panel">
      <img src={logo} alt="Logo CEIC" /><p className="manager-eyebrow">CUENTA ACTIVA</p>
      <h1>Sin taller asignado</h1><p>Tu cuenta aún no tiene un taller asociado. Contacta al administrador para solicitar una asignación.</p>
      <button className="manager-primary" onClick={logout}>Cerrar sesión</button>
    </section></main>
  )

  const adminNav = [
    ['dashboard', 'Resumen'], ['workshops', 'Talleres'], ['users', 'Usuarios'], ['products', 'Productos'],
  ]
  const nav = profile.role === 'admin' ? adminNav : [['workshop', 'Mi taller']]
  const sectionTitle = ({ dashboard: 'Resumen', workshops: 'Talleres', users: 'Usuarios', products: 'Productos', workshop: profile.workshop?.nombre })[section]

  return (
    <div className="manager-shell">
      <aside className="manager-sidebar">
        <a className="manager-brand" href="/"><img src={logo} alt="CEIC" /><span>CEIC<span>Gestión</span></span></a>
        <nav aria-label="Navegación principal">{nav.map(([id, label]) => <button key={id} className={section === id ? 'selected' : ''} onClick={() => { setSection(id); setSearch(''); setNotice('') }}>{label}</button>)}</nav>
        <div className="manager-side-bottom"><a href="/" target="_blank" rel="noreferrer">Ver catálogo</a><button onClick={logout}>Cerrar sesión</button></div>
      </aside>
      <main className="manager-main">
        <header className="manager-topbar"><div><span className="manager-eyebrow">{profile.role === 'admin' ? 'ADMINISTRACIÓN' : 'TALLER'}</span><h1>{sectionTitle}</h1></div><div className="manager-identity"><span>{profile.username}</span><span>{profile.role === 'admin' ? 'Administrador' : profile.workshop.nombre}</span></div></header>
        <section className="manager-content">
          {notice && <p className="manager-notice" role="status">{notice}<button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>×</button></p>}

          {section === 'dashboard' && profile.role === 'admin' && <>
            <div className="manager-stats">
              {[['Talleres', stats?.workshops], ['Usuarios', stats?.users], ['Productos', stats?.products]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value ?? '—'}</strong></article>)}
            </div>
            <h2>Administración</h2>
            <div className="manager-shortcuts">{adminNav.slice(1).map(([id, label]) => <button key={id} onClick={() => setSection(id)}><span>{label}</span><strong>{id === 'workshops' ? workshops.length : id === 'users' ? users.length : products.length}</strong><small>Gestionar {label.toLowerCase()} →</small></button>)}</div>
            <section className="manager-qr"><div><h2>Actividad del catálogo</h2><p>Escaneos QR registrados</p></div><strong>{stats?.qrScans ?? '—'}</strong></section>
          </>}

          {section === 'workshop' && profile.role === 'user' && <>
            <section className="manager-workshop-summary"><span>INFORMACIÓN DEL TALLER</span><h2>{profile.workshop.nombre}</h2><p>{profile.workshop.descripcion || 'Sin descripción registrada'}</p>{profile.workshop.direccion && <p>{profile.workshop.direccion}</p>}</section>
            <div className="manager-list-heading"><h2>Productos</h2><button className="manager-primary" onClick={() => openForm('product')}>+ Nuevo producto</button></div>
            <ProductTable items={filteredProducts} onEdit={(item) => openForm('product', item)} onDelete={(item) => removeItem('product', item)} search={search} setSearch={setSearch} loading={loadingData} />
          </>}

          {section === 'workshops' && profile.role === 'admin' && <>
            <div className="manager-list-heading"><p>{workshops.length} talleres registrados</p><button className="manager-primary" onClick={() => openForm('workshop')}>+ Nuevo taller</button></div>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar talleres" />
            <div className="manager-table-wrap"><table><thead><tr><th>Taller</th><th>Dirección</th><th>Usuarios</th><th>Productos</th><th>Estado</th><th></th></tr></thead><tbody>
              {filteredWorkshops.map((item) => <tr key={item.id_taller}><td><strong>{item.nombre}</strong><small>{item.descripcion || 'Sin descripción'}</small></td><td>{item.direccion || '—'}</td><td>{item.usuarios}</td><td>{item.productos}</td><td><Status active={item.activo} /></td><td><div className="manager-row-actions"><button onClick={() => { setWorkshopFilter(String(item.id_taller)); setSection('products') }}>Productos</button><button onClick={() => { setSearch(item.nombre); setSection('users') }}>Usuarios</button><RowActions onEdit={() => openForm('workshop', item)} onDelete={() => removeItem('workshop', item)} /></div></td></tr>)}
            </tbody></table>{filteredWorkshops.length === 0 && <Empty text={loadingData ? 'Cargando talleres...' : 'No hay talleres que coincidan.'} />}</div>
          </>}

          {section === 'users' && profile.role === 'admin' && <>
            <div className="manager-list-heading"><p>{users.length} usuarios registrados</p><button className="manager-primary" onClick={() => openForm('user')}>+ Nuevo usuario</button></div>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por nombre, correo o taller" />
            <div className="manager-table-wrap"><table><thead><tr><th>Usuario</th><th>Correo</th><th>Taller asignado</th><th>Estado</th><th></th></tr></thead><tbody>
              {filteredUsers.map((item) => <tr key={item.id_usuario}><td><strong>{item.nombre} {item.apellido}</strong><small>Usuario de taller</small></td><td>{item.correo}</td><td>{item.taller_nombre || 'Sin asignar'}</td><td><Status active={item.activo} /></td><td><RowActions onEdit={() => openForm('user', item)} onDelete={() => removeItem('user', item)} /></td></tr>)}
            </tbody></table>{filteredUsers.length === 0 && <Empty text={loadingData ? 'Cargando usuarios...' : 'No hay usuarios que coincidan.'} />}</div>
          </>}

          {section === 'products' && profile.role === 'admin' && <>
            <div className="manager-list-heading"><p>{products.length} productos registrados</p><button className="manager-primary" onClick={() => openForm('product')}>+ Nuevo producto</button></div>
            <div className="manager-filters"><SearchInput value={search} onChange={setSearch} placeholder="Buscar productos" /><select aria-label="Filtrar por taller" value={workshopFilter} onChange={(event) => setWorkshopFilter(event.target.value)}><option value="">Todos los talleres</option>{workshops.map((item) => <option key={item.id_taller} value={item.id_taller}>{item.nombre}</option>)}</select></div>
            <ProductTable items={filteredProducts} onEdit={(item) => openForm('product', item)} onDelete={(item) => removeItem('product', item)} loading={loadingData} />
          </>}
        </section>
      </main>

      {modal && <div className="manager-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null) }}><form className="manager-modal" onSubmit={saveForm}>
        <div className="manager-modal-heading"><h2>{modal.item ? 'Editar' : 'Crear'} {modal.type === 'workshop' ? 'taller' : modal.type === 'user' ? 'usuario' : 'producto'}</h2><button type="button" aria-label="Cerrar" onClick={() => setModal(null)}>×</button></div>
        {modal.type === 'workshop' && <>
          <Field label="Nombre"><input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} maxLength="100" required /></Field>
          <Field label="Descripción"><textarea value={form.descripcion} onChange={(event) => setForm({ ...form, descripcion: event.target.value })} /></Field>
          <Field label="Dirección"><input value={form.direccion} onChange={(event) => setForm({ ...form, direccion: event.target.value })} maxLength="255" /></Field>
          {modal.item && <CheckField label="Taller activo" checked={form.activo} onChange={(activo) => setForm({ ...form, activo })} />}
        </>}
        {modal.type === 'user' && <>
          <div className="manager-form-grid"><Field label="Nombre"><input value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} maxLength="100" required /></Field><Field label="Apellido"><input value={form.apellido} onChange={(event) => setForm({ ...form, apellido: event.target.value })} maxLength="100" /></Field></div>
          <Field label="Correo electrónico"><input type="email" value={form.correo} onChange={(event) => setForm({ ...form, correo: event.target.value })} required /></Field>
          <Field label={modal.item ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}><input type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength="8" required={!modal.item} /></Field>
          <Field label="Taller asignado"><select value={form.id_taller} onChange={(event) => setForm({ ...form, id_taller: event.target.value })}><option value="">Sin taller</option>{workshops.filter((item) => item.activo).map((item) => <option key={item.id_taller} value={item.id_taller}>{item.nombre}</option>)}</select></Field>
          {modal.item && <CheckField label="Cuenta activa" checked={form.activo} onChange={(activo) => setForm({ ...form, activo })} />}
        </>}
        {modal.type === 'product' && <>
          <Field label="Nombre"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength="150" required /></Field>
          <Field label="Descripción"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
          <div className="manager-form-grid"><Field label="Precio"><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></Field><Field label="Stock"><input type="number" min="0" step="1" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} required /></Field></div>
          {profile.role === 'admin' && <Field label="Taller"><select value={form.workshop_id} onChange={(event) => setForm({ ...form, workshop_id: event.target.value })} required><option value="">Seleccionar taller</option>{workshops.filter((item) => item.activo).map((item) => <option key={item.id_taller} value={item.id_taller}>{item.nombre}</option>)}</select></Field>}
          <Field label={modal.item ? 'Imagen (opcional)' : 'Imagen'}><input type="file" accept="image/*" onChange={(event) => setForm({ ...form, image: event.target.files?.[0] || null })} /></Field>
        </>}
        {notice && <p className="manager-error" role="alert">{notice}</p>}
        <div className="manager-modal-actions"><button type="button" onClick={() => setModal(null)}>Cancelar</button><button className="manager-primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar'}</button></div>
      </form></div>}
    </div>
  )
}

function ProductTable({ items, onEdit, onDelete, search, setSearch, loading }) {
  return <>
    {setSearch && <SearchInput value={search} onChange={setSearch} placeholder="Buscar productos" />}
    <div className="manager-table-wrap"><table><thead><tr><th>Producto</th><th>Taller</th><th>Precio</th><th>Stock</th><th></th></tr></thead><tbody>
      {items.map((item) => <tr key={item.id}><td className="manager-product-cell">{item.image_url && <img src={item.image_url} alt="" />}<span><strong>{item.name}</strong><small>{item.description || 'Sin descripción'}</small></span></td><td>{item.workshop_name || 'Mi taller'}</td><td>{formatPrecio(item.price)}</td><td>{item.stock}</td><td><RowActions onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} /></td></tr>)}
    </tbody></table>{items.length === 0 && <Empty text={loading ? 'Cargando productos...' : 'No hay productos que mostrar.'} />}</div>
  </>
}

function SearchInput({ value, onChange, placeholder }) {
  return <label className="manager-search"><span aria-hidden="true">⌕</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>
}

function RowActions({ onEdit, onDelete }) {
  return <div className="manager-row-actions"><button onClick={onEdit}>Editar</button><button onClick={onDelete}>Eliminar</button></div>
}

function Status({ active }) {
  return <span className={`manager-status ${active ? 'is-active' : 'is-inactive'}`}>{active ? 'Activo' : 'Inactivo'}</span>
}

function Empty({ text }) {
  return <p className="manager-empty">{text}</p>
}

function Field({ label, children }) {
  return <label className="manager-field"><span>{label}</span>{children}</label>
}

function CheckField({ label, checked, onChange }) {
  return <label className="manager-check"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>
}

export default Manager