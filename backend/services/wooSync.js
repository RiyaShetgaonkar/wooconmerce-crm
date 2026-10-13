// backend/services/wooSync.js
// Pull customers + orders from WooCommerce and upsert them into MySQL.
// Re-running is safe: rows are matched by WooCommerce id (orders) or
// WooCommerce customer id / email (customers) and updated in place.

const { transaction } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');
const { wooGetAll, getWooConfig } = require('./wooClient');
const { refreshStoredCustomerStats } = require('./customerStats');

let running = false;
let lastResult = null;

const clean = (s, max) => (s == null ? '' : String(s).trim()).slice(0, max);
const normEmail = (s) => clean(s, 255).toLowerCase();

/** WooCommerce GMT dates come as "2026-10-01T10:00:00" (no zone) -> MySQL DATETIME. */
const toMysqlDate = (gmt, local) => {
  const s = gmt || local;
  return s ? s.replace('T', ' ').slice(0, 19) : new Date().toISOString().slice(0, 19).replace('T', ' ');
};

async function writeToDb(customers, orders) {
  return transaction(async (conn) => {
    const counts = { customersCreated: 0, customersUpdated: 0, ordersCreated: 0, ordersUpdated: 0, ordersSkipped: 0, items: 0 };
    const updatedCustomers = new Set();
    const createdCustomers = new Set();
    const [orderRows] = await conn.execute('SELECT wc_order_id FROM orders');
    const knownOrders = new Set(orderRows.map((r) => String(r.wc_order_id)));

    // Lookup maps of what's already stored.
    const [existing] = await conn.execute('SELECT id, wc_customer_id, email FROM customers');
    const byWcId = new Map();
    const byEmail = new Map();
    existing.forEach((r) => {
      if (r.wc_customer_id != null) byWcId.set(String(r.wc_customer_id), r.id);
      byEmail.set(r.email.toLowerCase(), r.id);
    });

    async function upsertCustomer({ wcId, email, firstName, lastName, phone }) {
      const id = (wcId && byWcId.get(String(wcId))) || byEmail.get(email);
      if (id) {
        // Only overwrite fields WooCommerce actually provided.
        await conn.execute(
          `UPDATE customers SET
             wc_customer_id = COALESCE(?, wc_customer_id),
             first_name = IF(? = '', first_name, ?),
             last_name  = IF(? = '', last_name, ?),
             phone      = COALESCE(NULLIF(?, ''), phone)
           WHERE id = ?`,
          [wcId || null, firstName, firstName, lastName, lastName, phone, id]
        );
        updatedCustomers.add(id);
        if (wcId) byWcId.set(String(wcId), id);
        return id;
      }
      const [res] = await conn.execute(
        'INSERT INTO customers (wc_customer_id, first_name, last_name, email, phone) VALUES (?, ?, ?, ?, ?)',
        [wcId || null, firstName, lastName, email, phone || null]
      );
      counts.customersCreated++;
      createdCustomers.add(res.insertId);
      if (wcId) byWcId.set(String(wcId), res.insertId);
      byEmail.set(email, res.insertId);
      return res.insertId;
    }

    // 1. Registered customers
    for (const c of customers) {
      const email = normEmail(c.email || c.billing?.email);
      if (!email) continue;
      await upsertCustomer({
        wcId: c.id,
        email,
        firstName: clean(c.first_name || c.billing?.first_name, 100),
        lastName: clean(c.last_name || c.billing?.last_name, 100),
        phone: clean(c.billing?.phone, 50),
      });
    }

    // 2. Orders (guest orders create/match a customer by billing email)
    for (const o of orders) {
      const email = normEmail(o.billing?.email);
      let customerId = o.customer_id ? byWcId.get(String(o.customer_id)) : null;
      if (!customerId) {
        if (!email) { counts.ordersSkipped++; continue; }
        customerId = await upsertCustomer({
          wcId: o.customer_id || null,
          email,
          firstName: clean(o.billing?.first_name, 100),
          lastName: clean(o.billing?.last_name, 100),
          phone: clean(o.billing?.phone, 50),
        });
      }

      // LAST_INSERT_ID(id) makes insertId return the row id for updates too.
      const [orderRes] = await conn.execute(
        `INSERT INTO orders (wc_order_id, customer_id, total, currency, status, date_created)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           customer_id = VALUES(customer_id), total = VALUES(total), currency = VALUES(currency),
           status = VALUES(status), date_created = VALUES(date_created)`,
        [
          o.id,
          customerId,
          Number(o.total) || 0,
          clean(o.currency || 'USD', 3).toUpperCase(),
          clean(o.status || 'pending', 30),
          toMysqlDate(o.date_created_gmt, o.date_created),
        ]
      );
      // Replace the order's products with what WooCommerce has now.
      const orderId = orderRes.insertId;
      await conn.execute('DELETE FROM order_items WHERE order_id = ?', [orderId]);
      for (const item of o.line_items || []) {
        await conn.execute(
          `INSERT INTO order_items (order_id, wc_item_id, wc_product_id, product_name, sku, quantity, total)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            item.id || null,
            item.variation_id || item.product_id || null,
            clean(item.name, 255) || 'Unnamed product',
            clean(item.sku, 100) || null,
            Math.max(0, Number(item.quantity) || 0),
            Number(item.total) || 0,
          ]
        );
        counts.items++;
      }

      if (knownOrders.has(String(o.id))) counts.ordersUpdated++;
      else { counts.ordersCreated++; knownOrders.add(String(o.id)); }
    }

    // Customers created in this run aren't counted as updated too.
    counts.customersUpdated = [...updatedCustomers].filter((id) => !createdCustomers.has(id)).length;

    await refreshStoredCustomerStats(conn);
    return counts;
  });
}

/** Full sync. Only one runs at a time. */
async function syncFromWoo() {
  if (running) throw new HttpError(409, 'A sync is already running');
  running = true;
  const startedAt = new Date();
  try {
    const [customers, orders] = await Promise.all([
      wooGetAll('customers'), // default role 'customer' (skips admins; their orders still import)
      wooGetAll('orders', { orderby: 'date', order: 'asc' }),
    ]);
    const counts = await writeToDb(customers, orders);
    lastResult = {
      ok: true,
      startedAt,
      finishedAt: new Date(),
      fetched: { customers: customers.length, orders: orders.length },
      ...counts,
    };
    return lastResult;
  } catch (err) {
    lastResult = { ok: false, startedAt, finishedAt: new Date(), error: err.message };
    throw err;
  } finally {
    running = false;
  }
}

function getSyncStatus() {
  const { url, configured } = getWooConfig();
  return { configured, storeUrl: configured ? url : null, running, lastResult };
}

module.exports = { syncFromWoo, getSyncStatus };
