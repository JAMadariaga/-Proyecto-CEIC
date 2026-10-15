const { pool } = require('../db');

const list = () => pool.query(
  'SELECT id_admin, nombre, correo, activo, creado_en FROM admin ORDER BY id_admin'
);

const findById = (id) => pool.query('SELECT * FROM admin WHERE id_admin = $1', [id]);

const findByCorreo = (correo) => pool.query('SELECT * FROM admin WHERE LOWER(correo) = LOWER($1)', [correo]);

const create = ({ nombre, correo, passwordHash, activo = true }) => pool.query(
  `INSERT INTO admin (nombre, correo, password_hash, activo)
   VALUES ($1, $2, $3, $4) RETURNING id_admin, nombre, correo, activo, creado_en`,
  [nombre, correo, passwordHash, activo]
);

const createIfMissing = ({ nombre, correo, passwordHash }) => pool.query(
  `INSERT INTO admin (nombre, correo, password_hash)
   VALUES ($1, $2, $3) ON CONFLICT (correo) DO NOTHING`,
  [nombre, correo, passwordHash]
);

const update = (id, { nombre, correo, activo }) => pool.query(
  `UPDATE admin SET nombre = $2, correo = $3, activo = $4
   WHERE id_admin = $1 RETURNING id_admin, nombre, correo, activo, creado_en`,
  [id, nombre, correo, activo]
);

const updatePassword = (id, passwordHash) => pool.query(
  'UPDATE admin SET password_hash = $2 WHERE id_admin = $1',
  [id, passwordHash]
);

const remove = (id) => pool.query('DELETE FROM admin WHERE id_admin = $1', [id]);

module.exports = { list, findById, findByCorreo, create, createIfMissing, update, updatePassword, remove };