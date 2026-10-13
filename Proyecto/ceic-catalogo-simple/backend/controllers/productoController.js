const { pool } = require('../db');

const SELECT_PRODUCTS = `
  SELECT p.id_producto, p.nombre, p.descripcion, p.precio, p.stock,
         p.imagen_url, p.activo, p.creado_en, p.id_taller, t.nombre AS taller_nombre
  FROM productos p JOIN talleres t ON t.id_taller = p.id_taller`;

const list = (tallerNombre) => tallerNombre
  ? pool.query(`${SELECT_PRODUCTS} WHERE t.nombre = $1 AND p.activo = TRUE ORDER BY p.creado_en DESC`, [tallerNombre])
  : pool.query(`${SELECT_PRODUCTS} WHERE p.activo = TRUE ORDER BY p.creado_en DESC`);

const findById = (id) => pool.query(`${SELECT_PRODUCTS} WHERE p.id_producto = $1`, [id]);

const findImageById = (id) => pool.query(
  'SELECT imagen_url FROM productos WHERE id_producto = $1',
  [id]
);

const create = ({ idTaller, nombre, descripcion, precio, stock = 0, imagenUrl = null }) => pool.query(
  `INSERT INTO productos (id_taller, nombre, descripcion, precio, stock, imagen_url)
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_producto`,
  [idTaller, nombre, descripcion, precio, stock, imagenUrl]
).then((result) => findById(result.rows[0].id_producto));

const update = (id, { idTaller, nombre, descripcion, precio, imagenUrl }) => pool.query(
  `UPDATE productos
   SET id_taller = $2, nombre = $3, descripcion = $4, precio = $5,
       imagen_url = COALESCE($6, imagen_url)
   WHERE id_producto = $1 RETURNING id_producto`,
  [id, idTaller, nombre, descripcion, precio, imagenUrl]
).then((result) => result.rowCount ? findById(id) : result);

const remove = (id) => pool.query('DELETE FROM productos WHERE id_producto = $1', [id]);

module.exports = { list, findById, findImageById, create, update, remove };