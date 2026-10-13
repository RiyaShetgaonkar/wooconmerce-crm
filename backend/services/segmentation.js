// backend/services/segmentation.js
// Customer segmentation rules. Thresholds come from .env and can be
// overridden per call, e.g. classifyCustomer(stats, { highValueSpend: 1000 }).

const SEGMENTS = Object.freeze({
  NEW: 'New',
  REPEAT: 'Repeat',
  HIGH_VALUE: 'High-Value',
});

function toNonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Current thresholds (read lazily so .env is always loaded first). */
function getThresholds(overrides = {}) {
  return {
    highValueSpend: toNonNegativeNumber(
      overrides.highValueSpend ?? process.env.SEGMENT_HIGH_VALUE_SPEND, 500
    ),
    repeatOrders: toNonNegativeNumber(
      overrides.repeatOrders ?? process.env.SEGMENT_REPEAT_ORDERS, 2
    ),
  };
}

/**
 * Classify a single customer.
 *   High-Value: has ordered and total spend >= highValueSpend
 *   Repeat:     order count >= repeatOrders
 *   New:        everyone else (including customers with 0 orders)
 */
function classifyCustomer({ orderCount = 0, totalSpent = 0 } = {}, overrides = {}) {
  const t = getThresholds(overrides);
  const orders = Number(orderCount) || 0;
  const spent = Number(totalSpent) || 0;

  if (orders > 0 && spent >= t.highValueSpend) return SEGMENTS.HIGH_VALUE;
  if (orders >= t.repeatOrders) return SEGMENTS.REPEAT;
  return SEGMENTS.NEW;
}

/**
 * The same rules as a SQL CASE expression, so filtering/sorting by segment
 * can happen inside MySQL. countExpr/spendExpr must be trusted SQL written
 * in code, never user input.
 */
function segmentCaseSql(countExpr, spendExpr, overrides = {}) {
  const t = getThresholds(overrides);
  return {
    sql: `CASE
            WHEN ${countExpr} > 0 AND ${spendExpr} >= ? THEN '${SEGMENTS.HIGH_VALUE}'
            WHEN ${countExpr} >= ? THEN '${SEGMENTS.REPEAT}'
            ELSE '${SEGMENTS.NEW}'
          END`,
    params: [t.highValueSpend, t.repeatOrders],
  };
}

module.exports = { SEGMENTS, getThresholds, classifyCustomer, segmentCaseSql };