// backend/services/followUps.js
// Follow-up task queries and the rule-based "suggested action" triggers.

const { query } = require('../config/db');
const { UNRESOLVED_STATUSES } = require('../config/orderStatus');
const { SEGMENTS } = require('./segmentation');
const { buildCustomerStatsQuery } = require('./customerStats');
const { placeholders } = require('../utils/query');

const num = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Trigger thresholds; override in .env. */
function getTriggerConfig() {
  return {
    unresolvedAfterHours: num(process.env.FOLLOWUP_UNRESOLVED_HOURS, 24),
    contactGapDays: num(process.env.FOLLOWUP_CONTACT_GAP_DAYS, 30),
    lapsedDays: num(process.env.FOLLOWUP_LAPSED_DAYS, 60),
    limitPerRule: 10,
  };
}

// due_date is returned as a plain 'YYYY-MM-DD' string so the browser never
// shifts it across a timezone boundary.
const TASK_COLUMNS = `
  t.id, t.customer_id, t.title, t.description,
  DATE_FORMAT(t.due_date, '%Y-%m-%d') AS due_date,
  t.priority, t.status, t.completed_at, t.created_at,
  (t.status = 'pending' AND DATE(t.due_date) < UTC_DATE()) AS is_overdue,
  c.first_name, c.last_name, c.email`;

const TASK_FROM = 'FROM follow_up_tasks t JOIN customers c ON c.id = t.customer_id';

async function getTaskById(id) {
  const [task] = await query(`SELECT ${TASK_COLUMNS} ${TASK_FROM} WHERE t.id = ?`, [id]);
  return task ? { ...task, is_overdue: Boolean(task.is_overdue) } : null;
}

/** filters: { status: 'pending'|'completed'|'cancelled'|'all', customerId } */
async function listTasks({ status = 'pending', customerId = null } = {}) {
  const where = [];
  const params = [];
  if (status !== 'all') { where.push('t.status = ?'); params.push(status); }
  if (customerId) { where.push('t.customer_id = ?'); params.push(customerId); }

  const rows = await query(
    `SELECT ${TASK_COLUMNS} ${TASK_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY (t.status = 'pending') DESC, t.due_date ASC, t.id ASC
     LIMIT 500`,
    params
  );
  return rows.map((r) => ({ ...r, is_overdue: Boolean(r.is_overdue) }));
}

// Customers who already have an open task don't need another suggestion.
const NO_OPEN_TASK = (alias) =>
  `NOT EXISTS (SELECT 1 FROM follow_up_tasks ft WHERE ft.customer_id = ${alias}.id AND ft.status = 'pending')`;

/**
 * Suggested follow-ups, at most one per customer, most urgent rule first:
 *   unresolved_order    pending / on-hold / failed orders older than N hours
 *   high_value_no_contact  High-Value customers with no note in N days
 *   lapsed_customer     Repeat / High-Value customers with no order in N days
 */
async function getSuggestions(config = getTriggerConfig()) {
  const limit = Math.trunc(config.limitPerRule); // validated int, safe to interpolate
  const base = buildCustomerStatsQuery();

  const [unresolved, uncontacted, lapsed] = await Promise.all([
    query(
      `SELECT c.id AS customer_id, c.first_name, c.last_name, c.email,
              COUNT(*) AS order_count, SUM(o.total) AS amount,
              MIN(o.date_created) AS since,
              GROUP_CONCAT(DISTINCT o.status ORDER BY o.status) AS statuses
       FROM orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.status IN (${placeholders(UNRESOLVED_STATUSES)})
         AND o.date_created < UTC_TIMESTAMP() - INTERVAL ? HOUR
         AND ${NO_OPEN_TASK('c')}
       GROUP BY c.id
       ORDER BY amount DESC
       LIMIT ${limit}`,
      [...UNRESOLVED_STATUSES, config.unresolvedAfterHours]
    ),
    query(
      `SELECT t.id AS customer_id, t.first_name, t.last_name, t.email,
              t.total_spent AS amount, t.order_count, n.last_contact AS since
       FROM (${base.sql}) t
       LEFT JOIN (
         SELECT customer_id, MAX(created_at) AS last_contact
         FROM interaction_notes GROUP BY customer_id
       ) n ON n.customer_id = t.id
       WHERE t.segment = ?
         AND (n.last_contact IS NULL OR n.last_contact < UTC_TIMESTAMP() - INTERVAL ? DAY)
         AND ${NO_OPEN_TASK('t')}
       ORDER BY t.total_spent DESC
       LIMIT ${limit}`,
      [...base.params, SEGMENTS.HIGH_VALUE, config.contactGapDays]
    ),
    query(
      `SELECT t.id AS customer_id, t.first_name, t.last_name, t.email, t.segment,
              t.total_spent AS amount, t.order_count, t.last_order_date AS since
       FROM (${base.sql}) t
       WHERE t.segment IN (?, ?)
         AND t.last_order_date < UTC_TIMESTAMP() - INTERVAL ? DAY
         AND ${NO_OPEN_TASK('t')}
       ORDER BY t.total_spent DESC
       LIMIT ${limit}`,
      [...base.params, SEGMENTS.REPEAT, SEGMENTS.HIGH_VALUE, config.lapsedDays]
    ),
  ]);

  const suggestions = [];
  const seen = new Set();
  const add = (row, s) => {
    if (seen.has(row.customer_id)) return;
    seen.add(row.customer_id);
    suggestions.push({
      customer_id: row.customer_id,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      amount: Number(row.amount) || 0,
      since: row.since,
      ...s,
    });
  };

  unresolved.forEach((r) => add(r, {
    type: 'unresolved_order',
    priority: 'high',
    reason: `${r.order_count} unresolved order${r.order_count > 1 ? 's' : ''} (${r.statuses.replace(/,/g, ', ')})`,
    suggested_title: 'Help customer complete their order',
  }));
  uncontacted.forEach((r) => add(r, {
    type: 'high_value_no_contact',
    priority: 'medium',
    reason: r.since
      ? `High-Value customer, last contacted over ${config.contactGapDays} days ago`
      : 'High-Value customer, never contacted',
    suggested_title: 'Thank-you call / VIP check-in',
  }));
  lapsed.forEach((r) => add(r, {
    type: 'lapsed_customer',
    priority: 'low',
    reason: `${r.segment} customer, no order in ${config.lapsedDays}+ days`,
    suggested_title: 'Send win-back offer',
  }));

  return suggestions;
}

module.exports = { getTriggerConfig, getTaskById, listTasks, getSuggestions };
