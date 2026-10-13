const { pool } = require('../db');

const record = (source) => pool.query(
  'INSERT INTO qr_scans (source) VALUES ($1)',
  [source]
);

const count = () => pool.query('SELECT COUNT(*)::int AS total FROM qr_scans');

const countBySource = () => pool.query(
  'SELECT source, COUNT(*)::int AS total FROM qr_scans GROUP BY source ORDER BY total DESC'
);

module.exports = { record, count, countBySource };