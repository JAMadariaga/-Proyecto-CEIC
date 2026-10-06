require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

const connectionString = process.env.DATABASE_URL || `postgresql://${process.env.DB_USER || 'ceic_user'}:${process.env.DB_PASSWORD || 'ceic_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ceic_catalogo'}`;
const sslConfig = process.env.DATABASE_URL ? { rejectUnauthorized: false } : false;

// Configuración de PostgreSQL
const pool = new Pool({
  connectionString,
  ssl: sslConfig,
});

// Configuración de multer para subir imágenes
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());

// Servir archivos estáticos de React
app.use(express.static(path.join(__dirname, 'client/dist')));

// Autenticación de administrador
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
  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.admin = session;
  next();
};

// Crear tablas si no existen
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
    console.log('Tabla de productos verificada/creada');
  } catch (err) {
    console.error('Error al crear tabla:', err);
  }
};

initDB();

// API de prueba con conexión a DB
app.get('/api/test', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    res.json({ message: 'Conectado al servidor y a PostgreSQL' });
  } catch (err) {
    console.error('Error de conexión a PostgreSQL:', err);
    res.json({ message: 'Conectado al servidor, pero error en PostgreSQL' });
  }
});

// Iniciar sesión de administrador
app.post('/api/login', async (req, res) => {
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

// Verificar sesión actual
app.get('/api/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

// Cerrar sesión
app.post('/api/logout', requireAdmin, (req, res) => {
  sessions.delete(req.admin.token);
  res.json({ message: 'Sesión cerrada' });
});

// Obtener todos los productos
app.get('/api/products', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// Crear un nuevo producto
app.post('/api/products', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price } = req.body;
    let imagePath = null;

    if (req.file) {
      imagePath = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const result = await pool.query(
      'INSERT INTO products (name, description, price, image) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, description, price, imagePath]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error al crear producto:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

// Fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
