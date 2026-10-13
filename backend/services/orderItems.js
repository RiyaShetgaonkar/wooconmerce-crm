// backend/services/orderItems.js
// Shared SQL for the products inside orders.

const { query } = require('../config/db');
const { REVENUE_STATUSES } = require('../config/orderStatus');
const { placeholders } = require('../utils/query');

/**
 * Correlated subqueries adding, for each row of `orders <alias>`:
 *   items_summary  "Smart Fitness Watch, Coffee Mug × 2"
 *   item_count     total quantity
 */
const itemsColumnsSql = (alias = 'o') => `
  (SELECT GROUP_CONCAT(
            CONCAT(oi.product_name, IF(oi.quantity > 1, CONCAT(' × ', oi.quantity), ''))
            ORDER BY oi.id SEPARATOR ', ')
   FROM order_items oi WHERE oi.order_id = ${alias}.id) AS items_summary,
  (SELECT COALESCE(SUM(oi.quantity), 0)
   FROM order_items oi WHERE oi.order_id = ${alias}.id) AS item_count`;

/** Best sellers by units sold, counting only revenue orders. */
function getTopProducts(limit = 5) {
  return query(
    `SELECT oi.product_name,
            SUM(oi.quantity)               AS quantity,
            COALESCE(SUM(oi.total), 0)     AS revenue,
            COUNT(DISTINCT o.customer_id)  AS customers
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN (${placeholders(REVENUE_STATUSES)})
     GROUP BY oi.product_name
     ORDER BY quantity DESC, revenue DESC
     LIMIT ${Math.trunc(limit)}`,
    [...REVENUE_STATUSES]
  );
}

module.exports = { itemsColumnsSql, getTopProducts };
