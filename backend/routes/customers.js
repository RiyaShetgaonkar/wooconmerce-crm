// backend/routes/customers.js
// Mounted at /api/customers

const express = require('express');
const { query } = require('../config/db');
const { SEGMENTS, getThresholds } = require('../services/segmentation');
const { buildCustomerStatsQuery, getSegmentBreakdown } = require('../services/customerStats');
const { HttpError } = require('../middleware/errorHandler');
const { itemsColumnsSql } = require('../services/orderItems');
const {
  escapeLike, str, parseId, parsePagination, parseOptionalNumber, paginationMeta,
} = require('../utils/query');

const router = express.Router();

// Whitelisted sort keys -> columns (never interpolate raw user input).
const SORT_COLUMNS = {
  name: 't.last_name',
  email: 't.email',
  total_spent: 't.total_spent',
  order_count: 't.order_count',
  last_order_date: 't.last_order_date',
  created_at: 't.created_at',
};

/**
 * GET /api/customers
 * Query params (all optional):
 *   search      matches name, email or phone
 *   segment     New | Repeat | High-Value
 *   min_spent   minimum total spend
 *   min_orders  minimum order count
 *   sort        name | email | total_spent | order_count | last_order_date | created_at
 *   order       asc | desc (default desc)
 *   page, limit pagination (default 1, 20; max limit 100)
 */
router.get('/', async (req, res) => {
  const base = buildCustomerStatsQuery();
  const params = [...base.params];
  const where = [];

  const search = str(req.query.search);
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where.push(`(t.first_name LIKE ? OR t.last_name LIKE ?
                 OR CONCAT(t.first_name, ' ', t.last_name) LIKE ?
                 OR t.email LIKE ? OR t.phone LIKE ?)`);
    params.push(term, term, term, term, term);
  }

  const segment = str(req.query.segment);
  if (segment) {
    if (!Object.values(SEGMENTS).includes(segment)) {
      throw new HttpError(400, `Invalid segment. Use one of: ${Object.values(SEGMENTS).join(', ')}`);
    }
    where.push('t.segment = ?');
    params.push(segment);
  }

  const minSpent = parseOptionalNumber(req.query.min_spent, 'min_spent');
  if (minSpent !== null) { where.push('t.total_spent >= ?'); params.push(minSpent); }

  const minOrders = parseOptionalNumber(req.query.min_orders, 'min_orders');
  if (minOrders !== null) { where.push('t.order_count >= ?'); params.push(minOrders); }

  const sortCol = SORT_COLUMNS[str(req.query.sort)] || SORT_COLUMNS.total_spent;
  const dir = str(req.query.order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const { page, limit, offset } = parsePagination(req.query);

  const fromSql = `FROM (${base.sql}) t ${where.length ? `WHERE ${where.join(' AND ')}` : ''}`;

  const [rows, [{ total }]] = await Promise.all([
    // limit/offset are validated integers, so interpolation is safe here.
    query(`SELECT t.* ${fromSql} ORDER BY ${sortCol} ${dir}, t.id ASC LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*) AS total ${fromSql}`, params),
  ]);

  res.json({ data: rows, pagination: paginationMeta(page, limit, total) });
});

/**
 * GET /api/customers/segments
 * Customer count and revenue per segment, plus the active thresholds.
 * (Defined before /:id so "segments" isn't treated as an id.)
 */
router.get('/segments', async (req, res) => {
  const segments = await getSegmentBreakdown();
  res.json({ data: segments, thresholds: getThresholds() });
});

/**
 * GET /api/customers/:id
 * Full profile: live stats, purchase history, notes and follow-up tasks.
 */
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id, 'customer id');
  const base = buildCustomerStatsQuery();

  const [customer] = await query(`SELECT t.* FROM (${base.sql}) t WHERE t.id = ?`, [...base.params, id]);
  if (!customer) throw new HttpError(404, 'Customer not found');

  const [orders, notes, tasks] = await Promise.all([
    query(
      `SELECT o.id, o.wc_order_id, o.total, o.currency, o.status, o.date_created,
              ${itemsColumnsSql('o')}
       FROM orders o WHERE o.customer_id = ?
       ORDER BY o.date_created DESC`,
      [id]
    ),
    query(
      `SELECT id, note_type, content, created_by, created_at, updated_at
       FROM interaction_notes WHERE customer_id = ?
       ORDER BY created_at DESC`,
      [id]
    ),
    query(
      `SELECT id, title, description, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date,
              priority, status, completed_at, created_at
       FROM follow_up_tasks WHERE customer_id = ?
       ORDER BY (status = 'pending') DESC, due_date ASC`,
      [id]
    ),
  ]);

  const avgOrderValue = customer.order_count > 0
    ? Number((customer.total_spent / customer.order_count).toFixed(2))
    : 0;

  res.json({
    data: {
      ...customer,
      avg_order_value: avgOrderValue,
      orders,
      notes,
      tasks,
    },
  });
});

module.exports = router;