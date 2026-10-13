// backend/scripts/syncWoo.js
// Run a WooCommerce sync from the terminal:  npm run sync

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { closePool } = require('../config/db');
const { syncFromWoo } = require('../services/wooSync');

(async () => {
  try {
    console.log('🔄 Syncing from WooCommerce...');
    const r = await syncFromWoo();
    console.log(`✅ Fetched ${r.fetched.customers} customers and ${r.fetched.orders} orders`);
    console.log(`   Customers: ${r.customersCreated} new, ${r.customersUpdated} updated`);
    console.log(`   Orders:    ${r.ordersCreated} new, ${r.ordersUpdated} updated`
      + (r.ordersSkipped ? `, ${r.ordersSkipped} skipped (no email)` : ''));
  } catch (err) {
    console.error('❌ Sync failed:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
