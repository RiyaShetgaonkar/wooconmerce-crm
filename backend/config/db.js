// backend/config/db.js
// MySQL connection pool (mysql2/promise) with async/await helpers.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'woocommerce_crm',

  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,

  charset: 'utf8mb4',
  timezone: 'Z',          // store/read DATETIMEs as UTC
  decimalNumbers: true,   // return DECIMAL (total_spent, total) as JS numbers
  namedPlaceholders: true // allows :name placeholders as well as ?
});

// Run every session in UTC so TIMESTAMP columns (created_at, ...) and NOW()
// agree with the UTC DATETIMEs we store and with `timezone: 'Z'` above.
pool.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

/**
 * Run a parameterized query and return rows.
 * Usage: const rows = await query('SELECT * FROM customers WHERE id = ?', [id]);
 */
async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

/**
 * Run several statements in a single transaction.
 * The callback receives a dedicated connection; commit/rollback is automatic.
 * Usage:
 *   await transaction(async (conn) => {
 *     await conn.execute('INSERT INTO orders ...', [...]);
 *     await conn.execute('UPDATE customers ...', [...]);
 *   });
 */
async function transaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Verify connectivity at startup; call from server.js. */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    console.log(`✅ MySQL connected: ${process.env.DB_NAME || 'woocommerce_crm'}`);
  } finally {
    conn.release();
  }
}

/** Close the pool on shutdown. */
async function closePool() {
  await pool.end();
  console.log('MySQL pool closed');
}

module.exports = { pool, query, transaction, testConnection, closePool };