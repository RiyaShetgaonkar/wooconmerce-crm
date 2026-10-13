// backend/config/orderStatus.js
// Central definition of which WooCommerce statuses count as what.

// Orders that represent real revenue (money received or committed).
const REVENUE_STATUSES = Object.freeze(['completed', 'processing', 'on-hold']);

// Orders the store owner still needs to act on.
const PENDING_STATUSES = Object.freeze(['pending', 'processing', 'on-hold']);

// Orders stuck waiting on the customer (payment, stock, failed card) — worth a follow-up.
const UNRESOLVED_STATUSES = Object.freeze(['pending', 'on-hold', 'failed']);

module.exports = { REVENUE_STATUSES, PENDING_STATUSES, UNRESOLVED_STATUSES };