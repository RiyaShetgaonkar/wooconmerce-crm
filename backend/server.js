// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const express = require('express');
const cors = require('cors');

const { pool, testConnection, closePool } = require('./config/db');
const customersRouter = require('./routes/customers');
const ordersRouter = require('./routes/orders');
const communicationsRouter = require('./routes/communications');
const syncRouter = require('./routes/sync');
const { syncFromWoo, getSyncStatus } = require('./services/wooSync');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isDev = process.env.NODE_ENV !== 'production';

// ---------- Middleware ----------
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));

// Lightweight request logger for local development.
if (isDev) {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });
}

// ---------- Routes ----------
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', uptime: Math.round(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.use('/api/customers', customersRouter);
app.use('/api', ordersRouter); // /api/orders, /api/dashboard/stats
app.use('/api', communicationsRouter); // notes + follow-up tasks
app.use('/api/sync', syncRouter); // WooCommerce import

app.use(notFound);
app.use(errorHandler);

// ---------- Startup / shutdown ----------
let server;

async function start() {
  try {
    await testConnection();
  } catch (err) {
    console.error('❌ Could not connect to MySQL:', err.code || err.message);
    console.error('   Check that MySQL is running and the DB_* values in backend/.env are correct.');
    process.exit(1);
  }

  server = app.listen(PORT, () => {
    console.log(`🚀 API running at http://localhost:${PORT}/api`);
    console.log(`   CORS allowed origins: ${allowedOrigins.join(', ')}`);
    startAutoSync();
  });
}

// Optional background sync: set WC_SYNC_INTERVAL_MINUTES (e.g. 15) in .env.
function startAutoSync() {
  const minutes = Number(process.env.WC_SYNC_INTERVAL_MINUTES);
  if (!(minutes > 0) || !getSyncStatus().configured) return;
  console.log(`   WooCommerce auto-sync every ${minutes} min`);
  const run = () => syncFromWoo()
    .then((r) => console.log(`🔄 Woo sync: +${r.ordersCreated} orders, ${r.ordersUpdated} updated`))
    .catch((err) => console.error('🔄 Woo sync failed:', err.message));
  run();
  setInterval(run, minutes * 60 * 1000).unref();
}

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await closePool();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();