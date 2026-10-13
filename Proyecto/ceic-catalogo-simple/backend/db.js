const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const connectionString =
  process.env.DATABASE_URL ||
  `postgresql://${process.env.DB_USER || 'ceic_user'}:${process.env.DB_PASSWORD || 'ceic_password'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME || 'ceic_catalogo'}`;
const ssl = process.env.DATABASE_URL ? { rejectUnauthorized: false } : false;
const pool = new Pool({ connectionString, ssl });

const initializeDatabase = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin (
      id_admin SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      correo VARCHAR(150) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS talleres (
      id_taller SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      direccion VARCHAR(255),
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id_usuario SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      apellido VARCHAR(100),
      correo VARCHAR(150) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      id_taller INTEGER REFERENCES talleres(id_taller) ON DELETE SET NULL,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id_producto SERIAL PRIMARY KEY,
      id_taller INTEGER NOT NULL REFERENCES talleres(id_taller) ON DELETE RESTRICT,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT,
      precio NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      imagen_url TEXT,
      activo BOOLEAN NOT NULL DEFAULT TRUE,
      creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_usuarios_taller ON usuarios(id_taller)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_productos_taller ON productos(id_taller)');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS qr_scans (
      id SERIAL PRIMARY KEY,
      source VARCHAR(50),
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const workshopNames = [
    'Lavado de autos',
    'Repostería',
    'Mantención y reparaciones',
    'Tetería',
  ];
  for (const name of workshopNames) {
    await pool.query(
      'INSERT INTO talleres (nombre) SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM talleres WHERE nombre = $1)',
      [name]
    );
  }
};

module.exports = { pool, initializeDatabase };