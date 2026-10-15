const { pool } = require('../db');

const list = () => pool.query(
  `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.id_taller,
          u.activo, u.creado_en, t.nombre AS taller_nombre
   FROM usuarios u LEFT JOIN talleres t ON t.id_taller = u.id_taller
   ORDER BY u.id_usuario`
);

const findById = (id) => pool.query('SELECT * FROM usuarios WHERE id_usuario = $1', [id]);

const findByCorreo = (correo) => pool.query('SELECT * FROM usuarios WHERE LOWER(correo) = LOWER($1)', [correo]);

const create = ({ nombre, apellido = null, correo, passwordHash, idTaller = null, activo = true }) => pool.query(
  `INSERT INTO usuarios (nombre, apellido, correo, password_hash, id_taller, activo)
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
  [nombre, apellido, correo, passwordHash, idTaller, activo]
);

const update = (id, { nombre, apellido = null, correo, idTaller = null, activo }) => pool.query(
  `UPDATE usuarios SET nombre = $2, apellido = $3, correo = $4, id_taller = $5, activo = $6
   WHERE id_usuario = $1 RETURNING id_usuario, nombre, apellido, correo, id_taller, activo, creado_en`,
  [id, nombre, apellido, correo, idTaller, activo]
);

const updateWithPassword = async (id, { nombre, apellido = null, correo, idTaller = null, activo }, passwordHash) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE usuarios SET nombre = $2, apellido = $3, correo = $4, id_taller = $5, activo = $6
       WHERE id_usuario = $1 RETURNING id_usuario, nombre, apellido, correo, id_taller, activo, creado_en`,
      [id, nombre, apellido, correo, idTaller, activo]
    );
    if (result.rowCount) {
      await client.query('UPDATE usuarios SET password_hash = $2 WHERE id_usuario = $1', [id, passwordHash]);
    }
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const updatePassword = (id, passwordHash) => pool.query(
  'UPDATE usuarios SET password_hash = $2 WHERE id_usuario = $1',
  [id, passwordHash]
);

const remove = (id) => pool.query('DELETE FROM usuarios WHERE id_usuario = $1', [id]);

module.exports = { list, findById, findByCorreo, create, update, updateWithPassword, updatePassword, remove };