const { pool } = require('../db');

const list = () => pool.query('SELECT * FROM talleres ORDER BY id_taller');

const findById = (id) => pool.query('SELECT * FROM talleres WHERE id_taller = $1', [id]);

const findByName = (nombre) => pool.query('SELECT * FROM talleres WHERE nombre = $1', [nombre]);

const create = ({ nombre, descripcion = null, direccion = null, activo = true }) => pool.query(
  `INSERT INTO talleres (nombre, descripcion, direccion, activo)
   VALUES ($1, $2, $3, $4) RETURNING *`,
  [nombre, descripcion, direccion, activo]
);

const update = (id, { nombre, descripcion, direccion, activo }) => pool.query(
  `UPDATE talleres SET nombre = $2, descripcion = $3, direccion = $4, activo = $5
   WHERE id_taller = $1 RETURNING *`,
  [id, nombre, descripcion, direccion, activo]
);

const remove = (id) => pool.query('DELETE FROM talleres WHERE id_taller = $1', [id]);

module.exports = { list, findById, findByName, create, update, remove };