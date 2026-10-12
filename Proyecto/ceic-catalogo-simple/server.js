require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;
app.set('trust proxy', 1); 

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'ceic_user'}:${process.env.DB_PASSWORD || 'ceic_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ceic_catalogo'}`;
const sslConfig = process.env.DATABASE_URL ? { rejectUnauthorized: false } : false;

const pool = new Pool({ connectionString, ssl: sslConfig });

// Talleres  
const TALLERES = ['lavado-autos', 'reposteria', 'mantencion', 'teteria'];

// Subida de imagenes con un limite de 10 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('Solo se permiten imágenes'));
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client/dist')));

// Autenticacion                                                       
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
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

const getSession = (req) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
};

const requireAdmin = (req, res, next) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  req.admin = session;
  next();
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

// Base de datos                                                      
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) ON CONFLICT (username) DO NOTHING',
      [ADMIN_USERNAME, hashPassword(ADMIN_PASSWORD)]
    );
    console.log('Tabla de administradores verificada/creada');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Columnas nuevas 
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS taller VARCHAR(50)');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    console.log('Tabla de productos verificada/creada');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS qr_scans (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50),
        scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Tabla de escaneos QR verificada/creada');
  } catch (err) {
    console.error('Error al crear tablas:', err);
  }
};

initDB();

// Helpers de productos                              
// Nunca traemos la imagen completa en las listas
const PRODUCT_COLUMNS =
  'id, name, description, price, taller, created_at, updated_at, (image IS NOT NULL) AS has_image';

const toPublic = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  taller: row.taller,
  image_url: row.has_image
    ? `/api/products/${row.id}/image?v=${new Date(row.updated_at).getTime()}`
    : null,
  created_at: row.created_at,
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
  const taller = body.taller;

  if (!name || name.length > 255) return { error: 'El nombre es obligatorio (máx. 255 caracteres)' };
  if (!Number.isFinite(price) || price < 0 || price > 99999999) return { error: 'El precio no es válido' };
  if (!TALLERES.includes(taller)) return { error: 'Taller no válido' };
  return { data: { name, description, price, taller } };
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

app.get('/api/talleres', (req, res) => res.json(TALLERES));

// Rutas, sesion de administrador                                     
app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const result = await pool.query('SELECT username, password_hash FROM admins WHERE username = $1', [username]);
    const admin = result.rows[0];

    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username: admin.username, expiresAt: Date.now() + SESSION_TTL_MS });
    res.json({ token, username: admin.username });
  } catch (err) {
    console.error('Error al iniciar sesión:', err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

app.get('/api/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

app.post('/api/logout', requireAdmin, (req, res) => {
  sessions.delete(req.admin.token);
  res.json({ message: 'Sesión cerrada' });
});

// Cambiar contraseña 
app.post('/api/admin/password', requireAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  try {
    const result = await pool.query('SELECT password_hash FROM admins WHERE username = $1', [req.admin.username]);
    const admin = result.rows[0];
    if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }
    await pool.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [
      hashPassword(newPassword),
      req.admin.username,
    ]);
    res.json({ message: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    res.status(500).json({ error: 'Error al cambiar contraseña' });
  }
});

// Rutas para productos                                                   
// Para el publico, lista de productos, con filtro opcional por taller
app.get('/api/products', async (req, res) => {
  try {
    const { taller } = req.query;
    let result;
    if (taller) {
      if (!TALLERES.includes(taller)) return res.status(400).json({ error: 'Taller no válido' });
      result = await pool.query(
        `SELECT ${PRODUCT_COLUMNS} FROM products WHERE taller = $1 ORDER BY created_at DESC`,
        [taller]
      );
    } else {
      result = await pool.query(`SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY created_at DESC`);
    }
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
    const result = await pool.query('SELECT image FROM products WHERE id = $1', [id]);
    const image = result.rows[0] && result.rows[0].image;
    const match = image && image.match(/^data:(.+?);base64,(.+)$/);
    if (!match) return res.status(404).end();
    res.set('Content-Type', match[1]);
    res.set('Cache-Control', 'public, max-age=604800');
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
  const { name, description, price, taller } = parsed.data;

  try {
    const image = req.file ? await processImage(req.file.buffer) : null;
    const result = await pool.query(
      `INSERT INTO products (name, description, price, taller, image)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PRODUCT_COLUMNS}`,
      [name, description, price, taller, image]
    );
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
  const { name, description, price, taller } = parsed.data;

  try {
    const params = [name, description, price, taller, id];
    let sql = 'UPDATE products SET name = $1, description = $2, price = $3, taller = $4, updated_at = NOW()';
    if (req.file) {
      sql += ', image = $6';
      params.push(await processImage(req.file.buffer));
    }
    sql += ` WHERE id = $5 RETURNING ${PRODUCT_COLUMNS}`;

    const result = await pool.query(sql, params);
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
    const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
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
    await pool.query('INSERT INTO qr_scans (source) VALUES ($1)', [source]);
  } catch (err) {
    console.error('Error al registrar escaneo QR:', err); // no bloquea al visitante
  }
  res.redirect('/');
});

app.get('/api/admin/stats', requireAdmin, async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*)::int AS total FROM qr_scans');
    const bySource = await pool.query(
      'SELECT source, COUNT(*)::int AS total FROM qr_scans GROUP BY source ORDER BY total DESC'
    );
    res.json({ qrScans: total.rows[0].total, bySource: bySource.rows });
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
  next(err);
});

// Rutas /api inexistentes devuelven JSON, no el HTML de la SPA
app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Fallback para SPA 
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});