// frontend/src/utils/format.js
// Display helpers. MySQL DECIMAL columns arrive as strings, so always coerce.

const currencyFormatters = new Map();

/** Low-level formatter. In components use `money()` from useCurrency() so the $/₹ switch applies. */
export function formatMoney(value, currency = 'USD', { locale, decimals } = {}) {
  const code = currency || 'USD';
  const cacheKey = `${code}|${locale}|${decimals}`;
  if (!currencyFormatters.has(cacheKey)) {
    currencyFormatters.set(cacheKey, new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      ...(decimals != null && { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    }));
  }
  return currencyFormatters.get(cacheKey).format(Number(value) || 0);
}

const numberFormatter = new Intl.NumberFormat();
export const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return (withTime ? dateTimeFormatter : dateFormatter).format(d);
}

/** 'YYYY-MM-DD' in the browser's local time (for date inputs and due dates). */
export function toDateKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(days, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Format a 'YYYY-MM-DD' due date without timezone shifting: "Today", "Tomorrow", "Oct 20, 2026". */
export function formatDueDate(key) {
  if (!key) return '—';
  if (key === toDateKey()) return 'Today';
  if (key === addDays(1)) return 'Tomorrow';
  if (key === addDays(-1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return dateFormatter.format(new Date(y, m - 1, d));
}

export const isOverdue = (task) => task.status === 'pending' && task.due_date < toDateKey();

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS = [
  ['year', 31536000], ['month', 2592000], ['week', 604800],
  ['day', 86400], ['hour', 3600], ['minute', 60],
];

/** "3 hours ago", "yesterday", ... */
export function formatRelative(value) {
  if (!value) return '—';
  const seconds = (new Date(value).getTime() - Date.now()) / 1000;
  if (Number.isNaN(seconds)) return '—';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relativeFormatter.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ') || 'Guest';

export function initials(p) {
  const name = fullName(p);
  return name === 'Guest' ? '?' : name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
}

// WooCommerce core order statuses, in the order shown in filters.
export const ORDER_STATUSES = [
  'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed',
];

export const SEGMENTS = ['New', 'Repeat', 'High-Value'];

export const statusLabel = (s) => (s || 'unknown').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
