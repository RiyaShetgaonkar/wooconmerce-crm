// backend/scripts/seedDemo.js
// Fills the database with realistic demo data for testing the UI.
//
//   npm run db:seed      remove old demo data, then insert fresh demo data
//   npm run db:unseed    remove demo data only
//
// Demo rows are recognisable by their @demo.test email addresses, so this
// never touches real customers synced from WooCommerce.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const { transaction, closePool } = require('../config/db');
const { refreshStoredCustomerStats } = require('../services/customerStats');

const DEMO_DOMAIN = 'demo.test';
const FIRST_WC_ORDER_ID = 900001;

// Small seeded PRNG so every run produces the same data.
let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => min + rand() * (max - min);

const FIRST = ['Aarav', 'Maya', 'Liam', 'Sofia', 'Noah', 'Zara', 'Ethan', 'Priya', 'Lucas', 'Emma',
  'Kabir', 'Olivia', 'Mateo', 'Aisha', 'Leo', 'Chloe', 'Arjun', 'Isla', 'Omar', 'Nina'];
const LAST = ['Sharma', 'Lopez', 'Chen', 'Patel', 'Smith', 'Khan', 'Rossi', 'Fernandes', 'Kim', 'Novak',
  'Silva', 'Mehta', 'Brown', 'Dubois', 'Tanaka', 'Naik', 'Garcia', 'Iyer', 'Wilson', 'Costa'];

/**
 * Each profile is a list of orders as [daysAgo, total, status].
 * They are chosen so every segment and every suggestion rule shows up.
 */
const PROFILES = [
  // High-Value, recently active
  () => [[2, 320, 'processing'], [20, 280, 'completed'], [45, 150, 'completed']],
  // High-Value, never contacted (VIP suggestion)
  () => [[10, 640, 'completed']],
  // Repeat buyer, active
  () => [[5, 60, 'completed'], [40, 45, 'completed'], [75, 80, 'completed']],
  // Lapsed repeat buyer (win-back suggestion)
  () => [[95, 70, 'completed'], [130, 55, 'completed']],
  // New customer, single order
  () => [[between(1, 30) | 0, between(25, 120), 'completed']],
  // Unresolved order (pending payment / on-hold / failed)
  () => [[between(2, 6) | 0, between(40, 300), pick(['pending', 'on-hold', 'failed'])]],
  // Mixed history incl. refunds and cancellations
  () => [[15, 90, 'completed'], [25, 60, 'refunded'], [60, 110, 'cancelled']],
  // Brand-new sign-up with no orders
  () => [],
];

const NOTES = [
  ['call', 'Called to confirm delivery address. Very friendly, asked about bulk pricing.'],
  ['email', 'Sent follow-up email with care instructions for their last purchase.'],
  ['note', 'Prefers WhatsApp over email. Interested in the new autumn collection.'],
  ['meeting', 'Met at the pop-up store, wants to be notified about restocks.'],
];

const TASKS = [
  ['Send 10% loyalty discount code', -3, 'high'],    // overdue
  ['Check if replacement item arrived', 0, 'medium'], // due today
  ['Ask for a product review', 2, 'low'],
  ['Invite to VIP early-access list', 5, 'medium'],
];

const dateOnly = (daysFromNow) => {
  const d = new Date(Date.now() + daysFromNow * 86400000);
  return `${d.toISOString().slice(0, 10)} 00:00:00`;
};

async function clearDemo(conn) {
  // orders, notes and tasks cascade from customers.
  const [res] = await conn.execute('DELETE FROM customers WHERE email LIKE ?', [`%@${DEMO_DOMAIN}`]);
  return res.affectedRows;
}

async function seedDemo(conn) {
  let wcOrderId = FIRST_WC_ORDER_ID;
  const counts = { customers: 0, orders: 0, notes: 0, tasks: 0 };

  for (let i = 0; i < 32; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const email = `${first}.${last}${i}@${DEMO_DOMAIN}`.toLowerCase();
    const phone = rand() > 0.25 ? `+1 555 ${String(100 + i).padStart(3, '0')} ${String(1000 + i * 37).slice(-4)}` : null;
    const signupDaysAgo = Math.round(between(30, 200));

    const [c] = await conn.execute(
      `INSERT INTO customers (wc_customer_id, first_name, last_name, email, phone, created_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP() - INTERVAL ? DAY)`,
      [5000 + i, first, last, email, phone, signupDaysAgo]
    );
    const customerId = c.insertId;
    counts.customers++;

    for (const [daysAgo, total, status] of PROFILES[i % PROFILES.length]()) {
      const hours = Math.round(daysAgo * 24 + between(0, 20));
      await conn.execute(
        `INSERT INTO orders (wc_order_id, customer_id, total, currency, status, date_created)
         VALUES (?, ?, ?, 'USD', ?, UTC_TIMESTAMP() - INTERVAL ? HOUR)`,
        [wcOrderId++, customerId, Number(total).toFixed(2), status, hours]
      );
      counts.orders++;
    }

    // Notes on every 3rd customer (skipping the "never contacted" VIPs).
    if (i % 3 === 0 && i % PROFILES.length !== 1) {
      const [type, content] = NOTES[i % NOTES.length];
      await conn.execute(
        `INSERT INTO interaction_notes (customer_id, note_type, content, created_by, created_at)
         VALUES (?, ?, ?, 'Demo Admin', UTC_TIMESTAMP() - INTERVAL ? DAY)`,
        [customerId, type, content, Math.round(between(0, 20))]
      );
      counts.notes++;
    }

    // A handful of tasks: overdue, due today, upcoming, and one completed.
    if (i < TASKS.length) {
      const [title, dueIn, priority] = TASKS[i];
      await conn.execute(
        'INSERT INTO follow_up_tasks (customer_id, title, due_date, priority) VALUES (?, ?, ?, ?)',
        [customerId, title, dateOnly(dueIn), priority]
      );
      counts.tasks++;
    } else if (i === TASKS.length) {
      await conn.execute(
        `INSERT INTO follow_up_tasks (customer_id, title, due_date, priority, status, completed_at)
         VALUES (?, 'Welcome call', ?, 'low', 'completed', UTC_TIMESTAMP())`,
        [customerId, dateOnly(-1)]
      );
      counts.tasks++;
    }
  }

  await refreshStoredCustomerStats(conn);
  return counts;
}

(async () => {
  const clearOnly = process.argv.includes('--clear');
  try {
    await transaction(async (conn) => {
      const removed = await clearDemo(conn);
      if (removed) console.log(`🧹 Removed ${removed} existing demo customers`);
      if (clearOnly) return;
      const counts = await seedDemo(conn);
      console.log(`🌱 Seeded ${counts.customers} customers, ${counts.orders} orders, `
        + `${counts.notes} notes, ${counts.tasks} tasks`);
    });
  } catch (err) {
    console.error('❌ Seeding failed:', err.code === 'ER_DUP_ENTRY'
      ? `${err.message} (a WooCommerce order/customer id clashes with demo ids)`
      : err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
