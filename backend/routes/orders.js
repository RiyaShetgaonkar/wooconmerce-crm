// backend/routes/orders.js
// Mounted at /api  ->  /api/orders, /api/orders/:id, /api/dashboard/stats

const express = require('express');
const { query } = require('../config/db');
const { REVENUE_STATUSES, PENDING_STATUSES } = require('../config/orderStatus');
const { getSegmentBreakdown } = require('../services/customerStats');
const { getThresholds } = require('../services/segmentation');
const { itemsColumnsSql, getTopProducts } = require('../services/orderItems');
const { HttpError } = require('../middleware/errorHandler');
const {
  placeholders, escapeLike, str, parseId, parsePagination,
  parseOptionalNumber, parseOptionalDate, paginationMeta,
} = require('../utils/query');

const router = express.Router();

const SORT_COLUMNS = {
  date_created: 'o.date_created',
  total: 'o.total',
  status: 'o.status',
  wc_order_id: 'o.wc_order_id',
};

/**
 * GET /api/orders
 * Query params (all optional):
 *   status       single status or comma list, e.g. "processing,on-hold"
 *   customer_id  only this customer's orders
 *   from, to     YYYY-MM-DD (inclusive)
 *   min_total    minimum order total
 *   search       WooCommerce order number, customer name or email
 *   sort         date_created | total | status | wc_order_id
 *   order        asc | desc (default desc)
 *   page, limit  pagination
 */
router.get('/orders', async (req, res) => {
  const where = [];
  const params = [];

  const statuses = str(req.query.status).split(',').map((s) => s.trim()).filter(Boolean);
  if (statuses.length) {
    where.push(`o.status IN (${placeholders(statuses)})`);
    params.push(...statuses);
  }

  if (str(req.query.customer_id)) {
    where.push('o.customer_id = ?');
    params.push(parseId(req.query.customer_id, 'customer_id'));
  }

  const from = parseOptionalDate(req.query.from, 'from');
  if (from) { where.push('o.date_created >= ?'); params.push(from); }

  const to = parseOptionalDate(req.query.to, 'to');
  if (to) { where.push('o.date_created < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(to); }

  const minTotal = parseOptionalNumber(req.query.min_total, 'min_total');
  if (minTotal !== null) { where.push('o.total >= ?'); params.push(minTotal); }

  const search = str(req.query.search);
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where.push(`(CAST(o.wc_order_id AS CHAR) LIKE ? OR c.email LIKE ?
                 OR CONCAT(c.first_name, ' ', c.last_name) LIKE ?
                 OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_name LIKE ?))`);
    params.push(term, term, term, term);
  }

  const sortCol = SORT_COLUMNS[str(req.query.sort)] || SORT_COLUMNS.date_created;
  const dir = str(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const { page, limit, offset } = parsePagination(req.query);

  const fromSql = `
    FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  const [rows, [{ total }]] = await Promise.all([
    query(
      `SELECT o.id, o.wc_order_id, o.total, o.currency, o.status, o.date_created,
              o.customer_id, c.first_name, c.last_name, c.email,
              ${itemsColumnsSql('o')}
       ${fromSql}
       ORDER BY ${sortCol} ${dir}, o.id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    query(`SELECT COUNT(*) AS total ${fromSql}`, params),
  ]);

  res.json({ data: rows, pagination: paginationMeta(page, limit, total) });
});

/** GET /api/orders/:id  (internal id) */
router.get('/orders/:id', async (req, res) => {
  const id = parseId(req.params.id, 'order id');
  const [order] = await query(
    `SELECT o.*, c.first_name, c.last_name, c.email, c.phone
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.id = ?`,
    [id]
  );
  if (!order) throw new HttpError(404, 'Order not found');
  res.json({ data: order });
});

/**
 * GET /api/dashboard/stats
 * Headline numbers plus data for charts on the dashboard.
 */
router.get('/dashboard/stats', async (req, res) => {
  const rev = placeholders(REVENUE_STATUSES);
  const pend = placeholders(PENDING_STATUSES);

  const [
    [totals],
    ordersByStatus,
    revenueTrend,
    segments,
    recentOrders,
    [tasks],
    topProducts,
  ] = await Promise.all([
    query(
      `SELECT
         (SELECT COUNT(*) FROM customers)                                   AS total_customers,
         COUNT(*)                                                           AS total_orders,
         COALESCE(SUM(CASE WHEN status IN (${rev}) THEN total END), 0)      AS total_revenue,
         COUNT(CASE WHEN status IN (${rev}) THEN 1 END)                     AS paid_orders,
         COUNT(CASE WHEN status IN (${pend}) THEN 1 END)                    AS pending_orders,
         COALESCE(SUM(CASE WHEN status IN (${rev})
                            AND date_created >= UTC_TIMESTAMP() - INTERVAL 30 DAY
                           THEN total END), 0)                              AS revenue_last_30_days
       FROM orders`,
      [...REVENUE_STATUSES, ...REVENUE_STATUSES, ...PENDING_STATUSES, ...REVENUE_STATUSES]
    ),
    query(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
       FROM orders GROUP BY status ORDER BY count DESC`
    ),
    // Revenue per month for the current month and the 5 before it.
    query(
      `SELECT DATE_FORMAT(date_created, '%Y-%m') AS month,
              COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
       FROM orders
       WHERE status IN (${rev})
         AND date_created >= DATE_FORMAT(UTC_DATE() - INTERVAL 5 MONTH, '%Y-%m-01')
       GROUP BY month
       ORDER BY month`,
      [...REVENUE_STATUSES]
    ),
    getSegmentBreakdown(),
    query(
      `SELECT o.id, o.wc_order_id, o.total, o.currency, o.status, o.date_created,
              o.customer_id, c.first_name, c.last_name,
              ${itemsColumnsSql('o')}
       FROM orders o JOIN customers c ON c.id = o.customer_id
       ORDER BY o.date_created DESC
       LIMIT 5`
    ),
    query(
      `SELECT
         COUNT(CASE WHEN DATE(due_date) < UTC_DATE() THEN 1 END)         AS overdue,
         COUNT(CASE WHEN DATE(due_date) = UTC_DATE() THEN 1 END)         AS due_today,
         COUNT(*)                                                        AS open_total
       FROM follow_up_tasks
       WHERE status = 'pending'`
    ),
    getTopProducts(5),
  ]);

  const totalRevenue = Number(totals.total_revenue);
  const avgOrderValue = totals.paid_orders > 0
    ? Number((totalRevenue / totals.paid_orders).toFixed(2))
    : 0;

  res.json({
    data: {
      totals: {
        totalCustomers: totals.total_customers,
        totalOrders: totals.total_orders,
        totalRevenue,
        pendingOrders: totals.pending_orders,
        avgOrderValue,
        revenueLast30Days: Number(totals.revenue_last_30_days),
      },
      ordersByStatus,
      revenueTrend,
      segments,
      recentOrders,
      topProducts,
      tasks,
      config: {
        revenueStatuses: REVENUE_STATUSES,
        pendingStatuses: PENDING_STATUSES,
        segmentThresholds: getThresholds(),
      },
    },
  });
});

module.exports = router;