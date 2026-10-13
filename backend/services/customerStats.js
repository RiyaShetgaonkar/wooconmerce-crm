// backend/services/customerStats.js
// Shared SQL for customer stats (live-computed from the orders table).

const { pool } = require('../config/db');
const { REVENUE_STATUSES } = require('../config/orderStatus');
const { SEGMENTS, getThresholds, segmentCaseSql } = require('./segmentation');
const { placeholders } = require('../utils/query');

/**
 * Base SELECT returning every customer with live order_count, total_spent,
 * last_order_date and segment. Wrap it as a derived table:
 *   SELECT ... FROM (${sql}) t WHERE ...
 */
function buildCustomerStatsQuery() {
  const seg = segmentCaseSql('COALESCE(o.order_count, 0)', 'COALESCE(o.total_spent, 0)');

  const sql = `
    SELECT
      c.id, c.wc_customer_id, c.first_name, c.last_name, c.email, c.phone,
      c.created_at,
      COALESCE(o.order_count, 0)   AS order_count,
      COALESCE(o.total_spent, 0)   AS total_spent,
      o.last_order_date,
      ${seg.sql}                   AS segment
    FROM customers c
    LEFT JOIN (
      SELECT customer_id,
             COUNT(*)          AS order_count,
             SUM(total)        AS total_spent,
             MAX(date_created) AS last_order_date
      FROM orders
      WHERE status IN (${placeholders(REVENUE_STATUSES)})
      GROUP BY customer_id
    ) o ON o.customer_id = c.id`;

  // Order matters: CASE params appear before the IN (...) params.
  return { sql, params: [...seg.params, ...REVENUE_STATUSES] };
}

/** Count + revenue per segment, always returning all three segments. */
async function getSegmentBreakdown() {
  const base = buildCustomerStatsQuery();
  const [rows] = await pool.execute(
    `SELECT t.segment, COUNT(*) AS count, COALESCE(SUM(t.total_spent), 0) AS revenue
     FROM (${base.sql}) t
     GROUP BY t.segment`,
    base.params
  );

  return Object.values(SEGMENTS).map((segment) => {
    const row = rows.find((r) => r.segment === segment);
    return { segment, count: row ? row.count : 0, revenue: row ? Number(row.revenue) : 0 };
  });
}

/**
 * Write live stats back into the denormalized customers columns.
 * Call after a WooCommerce sync. Pass a transaction connection or the pool.
 * Omit customerId to refresh every customer.
 */
async function refreshStoredCustomerStats(conn = pool, customerId = null) {
  const t = getThresholds();
  const params = [...REVENUE_STATUSES, t.highValueSpend, t.repeatOrders];
  let sql = `
    UPDATE customers c
    LEFT JOIN (
      SELECT customer_id, COUNT(*) AS order_count, SUM(total) AS total_spent,
             MAX(date_created) AS last_order_date
      FROM orders
      WHERE status IN (${placeholders(REVENUE_STATUSES)})
      GROUP BY customer_id
    ) o ON o.customer_id = c.id
    SET c.order_count     = COALESCE(o.order_count, 0),
        c.total_spent     = COALESCE(o.total_spent, 0),
        c.last_order_date = o.last_order_date,
        c.segment = CASE
          WHEN COALESCE(o.order_count, 0) > 0 AND COALESCE(o.total_spent, 0) >= ? THEN '${SEGMENTS.HIGH_VALUE}'
          WHEN COALESCE(o.order_count, 0) >= ? THEN '${SEGMENTS.REPEAT}'
          ELSE '${SEGMENTS.NEW}'
        END`;

  if (customerId != null) {
    sql += ' WHERE c.id = ?';
    params.push(customerId);
  }

  const [result] = await conn.execute(sql, params);
  return result.affectedRows;
}

module.exports = { buildCustomerStatsQuery, getSegmentBreakdown, refreshStoredCustomerStats };