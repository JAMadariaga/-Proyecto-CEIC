const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');
const { pool, initializeDatabase } = require('./db');
const adminController = require('./controllers/adminController');
const usuarioController = require('./controllers/usuarioController');
const tallerController = require('./controllers/tallerController');
const productoController = require('./controllers/productoController');
const qrScanController = require('./controllers/qrScanController');
const { isAdmin, hasAssignedWorkshop, canManageWorkshop } = require('./authorization');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); 

const TALLERES = {
  'lavado-autos': 'Lavado de autos',
  reposteria: 'Repostería',
  mantencion: 'Mantención y reparaciones',
  teteria: 'Tetería',
};

// Subida de imagenes con un limite de 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  },
});

const allowedOrigins = new Set((process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
}));
app.use(express.json());
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// Autenticacion                                                       
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || ADMIN_USERNAME;
const ADMIN_NAME = process.env.ADMIN_NAME || 'Administrador';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const hashBuffer = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(password, salt, hashBuffer.length);
  return crypto.timingSafeEqual(hashBuffer, candidate);
};

const getToken = (req) => {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
};

const authenticate = async (req) => {
  const token = getToken(req);
  const session = token && sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const result = session.role === 'admin'
    ? await adminController.findById(session.id)
    : await usuarioController.findById(session.id);
  const account = result.rows[0];
  if (!account || !account.activo) {
    sessions.delete(token);
    return null;
  }

  return session.role === 'admin'
    ? { token, role: 'admin', id: account.id_admin, username: account.nombre, correo: account.correo }
    : {
      token,
      role: 'user',
      id: account.id_usuario,
      username: [account.nombre, account.apellido].filter(Boolean).join(' '),
      correo: account.correo,
      id_taller: account.id_taller,
    };
};

const requireAuth = async (req, res, next) => {
  try {
    req.auth = await authenticate(req);
    if (!req.auth) return res.status(401).json({ error: 'No autorizado' });
    next();
  } catch (err) {
    next(err);
  }
};

const requireAdmin = async (req, res, next) => {
  await requireAuth(req, res, () => {
    if (!isAdmin(req.auth)) return res.status(403).json({ error: 'Acceso denegado' });
    next();
  });
};

const requireAssignedWorkshop = async (req, res, next) => {
  await requireAuth(req, res, async () => {
    if (req.auth.role !== 'user') return res.status(403).json({ error: 'Esta operación es exclusiva para usuarios de taller' });
    if (!hasAssignedWorkshop(req.auth)) return res.status(403).json({ error: 'No tienes un taller asignado' });
    try {
      const result = await tallerController.findById(req.auth.id_taller);
      req.auth.workshop = result.rows[0] || null;
      if (!req.auth.workshop || !req.auth.workshop.activo) {
        return res.status(403).json({ error: 'Tu taller no está disponible' });
      }
      next();
    } catch (err) {
      next(err);
    }
  });
};

// Limite de intentos de login por IP, 10 cada 15 min
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 10;

const loginLimiter = (req, res, next) => {
  const now = Date.now();
  const entry = loginAttempts.get(req.ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(req.ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }
  entry.count += 1;
  if (entry.count > LOGIN_MAX) {
    return res.status(429).json({ error: 'Demasiados intentos. Intenta de nuevo en unos minutos.' });
  }
  next();
};

// Las tablas del catálogo se crean al iniciar la aplicación.

// Helpers de productos                              
// Nunca traemos la imagen completa en las listas
const toPublic = (row) => ({
  id: row.id_producto,
  name: row.nombre,
  description: row.descripcion,
  price: Number(row.precio),
  stock: Number(row.stock || 0),
  workshop_id: row.id_taller,
  workshop_name: row.taller_nombre,
  taller: Object.keys(TALLERES).find((slug) => TALLERES[slug] === row.taller_nombre)
    || String(row.taller_nombre || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  image_url: !row.imagen_url
    ? null
    : row.imagen_url.startsWith('data:')
      ? `/api/products/${row.id_producto}/image`
      : row.imagen_url,
  created_at: row.creado_en,
});

// Redimensiona, corrige la rotacion del celular y comprime a JPEG
const processImage = async (buffer) => {
  const out = await sharp(buffer)
    .rotate()
    .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return `data:image/jpeg;base64,${out.toString('base64')}`;
};

// Valida y limpia los datos del formulario. Devuelve { error } o { data }
const parseProductBody = (body) => {
  const name = (body.name || '').trim();
  const description = (body.description || '').trim();
  const price = Number(body.price);
  const stock = Number(body.stock ?? 0);
  const workshopId = parseId(body.workshop_id);
  const legacyWorkshop = body.taller;

  if (!name || name.length > 150) return { error: 'El nombre es obligatorio (máx. 150 caracteres)' };
  if (!Number.isFinite(price) || price < 0 || price > 9999999999.99) return { error: 'El precio no es válido' };
  if (!Number.isInteger(stock) || stock < 0) return { error: 'El stock debe ser un entero mayor o igual a cero' };
  return { data: { name, description, price, stock, workshopId, legacyWorkshop } };
};

const parseId = (value) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// Rutas: sistema                                                     
app.get('/api/test', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ message: 'Conectado al servidor y a PostgreSQL' });
  } catch (err) {
    console.error('Error de conexión a PostgreSQL:', err);
    res.json({ message: 'Conectado al servidor, pero error en PostgreSQL' });
  }
});

app.get('/api/talleres', (req, res) => res.json(Object.keys(TALLERES)));
app.get('/api/workshops', async (req, res) => {
  try {
    const result = await tallerController.list();
    res.json(result.rows.filter((workshop) => workshop.activo));
  } catch (err) {
    console.error('Error al obtener talleres:', err);
    res.status(500).json({ error: 'Error al obtener talleres' });
  }
});

// Rutas, sesion de administrador                                     
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, email, password } = req.body || {};
  const identity = String(email || username || '').trim().toLowerCase();
  if (!identity || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const adminResult = await adminController.findByCorreo(identity);
    const userResult = adminResult.rows[0] ? { rows: [] } : await usuarioController.findByCorreo(identity);
    const account = adminResult.rows[0] || userResult.rows[0];
    const role = adminResult.rows[0] ? 'admin' : 'user';

    if (!account || !account.activo || !verifyPassword(password, account.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, {
      role,
      id: role === 'admin' ? account.id_admin : account.id_usuario,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    res.json({
      token,
      role,
      username: role === 'admin' ? account.nombre : [account.nombre, account.apellido].filter(Boolean).join(' '),
      id_taller: role === 'user' ? account.id_taller : null,
    });
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    let workshop = null;
    if (req.auth.role === 'user' && req.auth.id_taller) {
      const result = await tallerController.findById(req.auth.id_taller);
      workshop = result.rows[0]?.activo ? result.rows[0] : null;
    }
    res.json({
      id: req.auth.id,
      role: req.auth.role,
      username: req.auth.username,
      email: req.auth.correo,
      workshop,
    });
  } catch (err) {
    console.error('Error al obtener perfil:', err);
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
});

app.post('/api/logout', requireAuth, (req, res) => {
  sessions.delete(req.auth.token);
  res.json({ message: 'Sesión cerrada' });
});

// Cambiar contraseña 
app.post('/api/admin/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  try {
    if (req.auth.role !== 'admin') return res.status(403).json({ error: 'Acceso denegado' });
    const result = await adminController.findById(req.auth.id);
    const admin = result.rows[0];
    if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }
    await adminController.updatePassword(admin.id_admin, hashPassword(newPassword));
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

app.get('/api/admin/workshops', requireAdmin, async (req, res) => {
  try {
    const result = await tallerController.listWithCounts();
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener talleres:', err);
    res.status(500).json({ error: 'Error al obtener talleres' });
  }
});

app.post('/api/admin/workshops', requireAdmin, async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const descripcion = String(req.body?.descripcion || '').trim();
  const direccion = String(req.body?.direccion || '').trim();
  if (!nombre || nombre.length > 100) return res.status(400).json({ error: 'El nombre es obligatorio (máx. 100 caracteres)' });
  if (direccion.length > 255) return res.status(400).json({ error: 'La dirección no puede superar 255 caracteres' });
  try {
    const result = await tallerController.create({
      nombre,
      descripcion: descripcion || null,
      direccion: direccion || null,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear taller:', err);
    res.status(500).json({ error: 'Error al crear taller' });
  }
});

app.put('/api/admin/workshops/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const nombre = String(req.body?.nombre || '').trim();
  const descripcion = String(req.body?.descripcion || '').trim();
  const direccion = String(req.body?.direccion || '').trim();
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  if (!nombre || nombre.length > 100) return res.status(400).json({ error: 'El nombre es obligatorio (máx. 100 caracteres)' });
  if (direccion.length > 255) return res.status(400).json({ error: 'La dirección no puede superar 255 caracteres' });
  try {
    const result = await tallerController.update(id, {
      nombre,
      descripcion: descripcion || null,
      direccion: direccion || null,
      activo: req.body.activo !== false,
    });
    if (!result.rowCount) return res.status(404).json({ error: 'Taller no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al editar taller:', err);
    res.status(500).json({ error: 'Error al editar taller' });
  }
});

app.delete('/api/admin/workshops/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  try {
    const result = await tallerController.remove(id);
    if (!result.rowCount) return res.status(404).json({ error: 'Taller no encontrado' });
    res.json({ message: 'Taller eliminado; los usuarios asignados quedan sin taller' });
  } catch (err) {
    if (err.code === '23503') return res.status(409).json({ error: 'No se puede eliminar: el taller tiene productos asociados' });
    console.error('Error al eliminar taller:', err);
    res.status(500).json({ error: 'Error al eliminar taller' });
  }
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const result = await usuarioController.list();
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const nombre = String(req.body?.nombre || '').trim();
  const apellido = String(req.body?.apellido || '').trim() || null;
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const rawWorkshopId = req.body?.id_taller;
  const idTaller = rawWorkshopId === '' || rawWorkshopId == null ? null : parseId(rawWorkshopId);
  if (!nombre || nombre.length > 100) return res.status(400).json({ error: 'El nombre es obligatorio (máx. 100 caracteres)' });
  if (!validEmail(correo) || correo.length > 150) return res.status(400).json({ error: 'El correo electrónico no es válido (máx. 150 caracteres)' });
  if (apellido && apellido.length > 100) return res.status(400).json({ error: 'El apellido no puede superar 100 caracteres' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña inicial debe tener al menos 8 caracteres' });
  if (rawWorkshopId != null && rawWorkshopId !== '' && !idTaller) return res.status(400).json({ error: 'Taller no válido' });
  try {
    if (idTaller) {
      const workshop = await tallerController.findById(idTaller);
      if (!workshop.rows[0] || !workshop.rows[0].activo) return res.status(400).json({ error: 'Taller no válido' });
    }
    const result = await usuarioController.create({ nombre, apellido, correo, passwordHash: hashPassword(password), idTaller });
    const created = await usuarioController.list();
    res.status(201).json(created.rows.find((user) => user.id_usuario === result.rows[0].id_usuario));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    console.error('Error al crear usuario:', err);
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const nombre = String(req.body?.nombre || '').trim();
  const apellido = String(req.body?.apellido || '').trim() || null;
  const correo = String(req.body?.correo || '').trim().toLowerCase();
  const rawWorkshopId = req.body?.id_taller;
  const idTaller = rawWorkshopId === '' || rawWorkshopId == null ? null : parseId(rawWorkshopId);
  const password = String(req.body?.password || '');
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  if (!nombre || nombre.length > 100) return res.status(400).json({ error: 'El nombre es obligatorio (máx. 100 caracteres)' });
  if (!validEmail(correo) || correo.length > 150) return res.status(400).json({ error: 'El correo electrónico no es válido (máx. 150 caracteres)' });
  if (apellido && apellido.length > 100) return res.status(400).json({ error: 'El apellido no puede superar 100 caracteres' });
  if (password && password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (rawWorkshopId != null && rawWorkshopId !== '' && !idTaller) return res.status(400).json({ error: 'Taller no válido' });
  try {
    if (idTaller) {
      const workshop = await tallerController.findById(idTaller);
      if (!workshop.rows[0] || !workshop.rows[0].activo) return res.status(400).json({ error: 'Taller no válido' });
    }
    const userChanges = {
      nombre,
      apellido,
      correo,
      idTaller,
      activo: req.body.activo !== false,
    };
    const result = password
      ? await usuarioController.updateWithPassword(id, userChanges, hashPassword(password))
      : await usuarioController.update(id, userChanges);
    if (!result.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    const users = await usuarioController.list();
    res.json(users.rows.find((user) => user.id_usuario === id));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe una cuenta con ese correo' });
    console.error('Error al editar usuario:', err);
    res.status(500).json({ error: 'Error al editar usuario' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  try {
    const result = await usuarioController.remove(id);
    if (!result.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    for (const [token, session] of sessions) {
      if (session.role === 'user' && session.id === id) sessions.delete(token);
    }
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  const idTaller = req.query.workshop_id ? parseId(req.query.workshop_id) : null;
  if (req.query.workshop_id && !idTaller) return res.status(400).json({ error: 'Taller no válido' });
  try {
    const result = await productoController.listAdmin({ idTaller, search: String(req.query.search || '').trim() });
    res.json(result.rows.map(toPublic));
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.get('/api/me/workshop', requireAssignedWorkshop, (req, res) => res.json(req.auth.workshop));
app.get('/api/my/products', requireAssignedWorkshop, async (req, res) => {
  try {
    const result = await productoController.listAdmin({ idTaller: req.auth.id_taller });
    res.json(result.rows.map(toPublic));
  } catch (err) {
    console.error('Error al obtener productos del taller:', err);
    res.status(500).json({ error: 'Error al obtener productos del taller' });
  }
});

app.post('/api/my/products', requireAssignedWorkshop, upload.single('image'), async (req, res) => {
  const parsed = parseProductBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const image = req.file ? await processImage(req.file.buffer) : null;
    const result = await productoController.create({
      idTaller: req.auth.id_taller,
      nombre: parsed.data.name,
      descripcion: parsed.data.description,
      precio: parsed.data.price,
      stock: parsed.data.stock,
      imagenUrl: image,
    });
    res.status(201).json(toPublic(result.rows[0]));
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

app.put('/api/my/products/:id', requireAssignedWorkshop, upload.single('image'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  const parsed = parseProductBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  try {
    const existing = await productoController.findById(id);
    if (!existing.rows[0] || !canManageWorkshop(req.auth, existing.rows[0].id_taller)) {
      return res.status(404).json({ error: 'Producto no encontrado en tu taller' });
    }
    const image = req.file ? await processImage(req.file.buffer) : null;
    const result = await productoController.update(id, {
      idTaller: req.auth.id_taller,
      nombre: parsed.data.name,
      descripcion: parsed.data.description,
      precio: parsed.data.price,
      stock: parsed.data.stock,
      imagenUrl: image,
    });
    res.json(toPublic(result.rows[0]));
  } catch (err) {
    console.error('Error al editar producto:', err);
    res.status(500).json({ error: 'Error al editar producto' });
  }
});

app.delete('/api/my/products/:id', requireAssignedWorkshop, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  try {
    const result = await pool.query('DELETE FROM productos WHERE id_producto = $1 AND id_taller = $2', [id, req.auth.id_taller]);
    if (!result.rowCount) return res.status(404).json({ error: 'Producto no encontrado en tu taller' });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Rutas para productos                                                   
// Para el publico, lista de productos, con filtro opcional por taller
app.get('/api/products', async (req, res) => {
  try {
    const { taller } = req.query;
    if (taller) {
      if (!Object.hasOwn(TALLERES, taller)) return res.status(400).json({ error: 'Taller no válido' });
    }
    const result = await productoController.list(taller ? TALLERES[taller] : null);
    res.json(result.rows.map(toPublic));
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// para el publico, imagen de un producto 
app.get('/api/products/:id/image', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).end();
  try {
    const result = await productoController.findImageById(id);
    const image = result.rows[0] && result.rows[0].imagen_url;
    const match = image && image.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(404).end();
    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Error al obtener imagen:', err);
    res.status(500).end();
  }
});

// ADMIN, para crear producto
app.post('/api/products', requireAdmin, upload.single('image'), async (req, res) => {
  const parsed = parseProductBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { name, description, price, stock, workshopId, legacyWorkshop } = parsed.data;

  try {
    const workshopResult = workshopId
      ? await tallerController.findById(workshopId)
      : Object.hasOwn(TALLERES, legacyWorkshop)
        ? await tallerController.findByName(TALLERES[legacyWorkshop])
        : { rows: [] };
    const workshop = workshopResult.rows[0];
    if (!workshop || !workshop.activo) return res.status(400).json({ error: 'Taller no válido' });
    const image = req.file ? await processImage(req.file.buffer) : null;
    const result = await productoController.create({
      idTaller: workshop.id_taller,
      nombre: name,
      descripcion: description,
      precio: price,
      stock,
      imagenUrl: image,
    });
    res.status(201).json(toPublic(result.rows[0]));
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// ADMIN, para editar producto. La imagen es opcional, si no se envia, se conserva la actual
app.put('/api/products/:id', requireAdmin, upload.single('image'), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  const parsed = parseProductBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const { name, description, price, stock, workshopId, legacyWorkshop } = parsed.data;

  try {
    const workshopResult = workshopId
      ? await tallerController.findById(workshopId)
      : Object.hasOwn(TALLERES, legacyWorkshop)
        ? await tallerController.findByName(TALLERES[legacyWorkshop])
        : { rows: [] };
    const workshop = workshopResult.rows[0];
    if (!workshop || !workshop.activo) return res.status(400).json({ error: 'Taller no válido' });
    const image = req.file ? await processImage(req.file.buffer) : null;
    const result = await productoController.update(id, {
      idTaller: workshop.id_taller,
      nombre: name,
      descripcion: description,
      precio: price,
      stock,
      imagenUrl: image,
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(toPublic(result.rows[0]));
  } catch (err) {
    console.error('Error al editar producto:', err);
    res.status(500).json({ error: 'Error al editar producto' });
  }
});

// ADMIN, para eliminar producto
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });
  try {
    const result = await productoController.remove(id);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// QR y estadísticas, el código QR apunta a /qr?src=lavado-autos, /qr?src=reposteria, etc. 
// Registra el escaneo y redirige al catalogo. 
app.get('/qr', async (req, res) => {
  const source = String(req.query.src || 'general').slice(0, 50);
  try {
    await qrScanController.record(source);
  } catch (err) {
    console.error('Error al registrar escaneo QR:', err); // no bloquea al visitante
  }
  res.redirect('/');
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const total = await qrScanController.count();
    const bySource = await qrScanController.countBySource();
    const totals = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM talleres WHERE activo = TRUE)::INTEGER AS workshops,
        (SELECT COUNT(*) FROM usuarios WHERE activo = TRUE)::INTEGER AS users,
        (SELECT COUNT(*) FROM productos WHERE activo = TRUE)::INTEGER AS products
    `);
    res.json({ ...totals.rows[0], qrScans: Number(total.rows[0].total), bySource: bySource.rows });
  } catch (err) {
    console.error('Error al obtener estadísticas:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// Errores y fallback                                                 
// Errores de subida, como un archivo muy grande, no es imagen, etc.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message === 'Solo se permiten imágenes') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen supera los 10 MB' : err.message;
    return res.status(400).json({ error: msg });
  }
  console.error('Error de API:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Rutas /api inexistentes devuelven JSON, no el HTML de la SPA
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Fallback para SPA 
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const start = async () => {
  try {
    if (!ADMIN_PASSWORD) {
      throw new Error('Configura ADMIN_PASSWORD en el archivo .env antes de iniciar el servidor');
    }
    await initializeDatabase();
    await adminController.createIfMissing({
      nombre: ADMIN_NAME,
      correo: ADMIN_EMAIL,
      passwordHash: hashPassword(ADMIN_PASSWORD),
    });
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Error al inicializar la base de datos:', err);
    await pool.end();
    process.exitCode = 1;
  }
};

start();