// backend/routes/sync.js
// Mounted at /api/sync
//   GET  /api/sync   is WooCommerce configured? last sync result
//   POST /api/sync   run a full customer + order sync now

const express = require('express');
const { syncFromWoo, getSyncStatus } = require('../services/wooSync');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ data: getSyncStatus() });
});

router.post('/', async (req, res) => {
  const result = await syncFromWoo();
  res.json({ data: result });
});

module.exports = router;
