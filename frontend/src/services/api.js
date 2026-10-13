// frontend/src/services/api.js
// Thin fetch wrapper around the Express API.

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status; // 0 = network error (backend not reachable)
    this.details = details;
  }
}

/** Turn { a: 1, b: '', c: ['x','y'] } into "?a=1&c=x,y" (skips empty values). */
function toQueryString(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    qs.append(key, Array.isArray(value) ? value.join(',') : String(value));
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

async function request(path, { params, signal, body, method = 'GET' } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}${toQueryString(params)}`, {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(`Can't reach the API at ${BASE_URL}.`, 0);
  }

  if (res.status === 204) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(json?.error || `Request failed with status ${res.status}`, res.status, json?.details);
  }
  return json;
}

// ---------- Health ----------
export const getHealth = (opts) => request('/health', opts);

// ---------- Dashboard ----------
/** Returns { totals, ordersByStatus, revenueTrend, segments, recentOrders, tasks, config } */
export const getDashboardStats = (opts) =>
  request('/dashboard/stats', opts).then((r) => r.data);

// ---------- Customers ----------
/**
 * filters: { search, segment, min_spent, min_orders, sort, order, page, limit }
 * Returns { data: Customer[], pagination }
 */
export const getCustomers = (filters = {}, opts) =>
  request('/customers', { ...opts, params: filters });

/** Returns { data: [{ segment, count, revenue }], thresholds } */
export const getSegments = (opts) => request('/customers/segments', opts);

/** Returns customer with stats + orders, notes, tasks */
export const getCustomer = (id, opts) =>
  request(`/customers/${encodeURIComponent(id)}`, opts).then((r) => r.data);

// ---------- Orders ----------
/**
 * filters: { status, customer_id, from, to, min_total, search, sort, order, page, limit }
 * Returns { data: Order[], pagination }
 */
export const getOrders = (filters = {}, opts) =>
  request('/orders', { ...opts, params: filters });

export const getOrder = (id, opts) =>
  request(`/orders/${encodeURIComponent(id)}`, opts).then((r) => r.data);

// ---------- Interaction notes ----------
export const getNotes = (customerId, opts) =>
  request(`/customers/${encodeURIComponent(customerId)}/notes`, opts).then((r) => r.data);

/** note: { content, note_type?, created_by? } */
export const addNote = (customerId, note) =>
  request(`/customers/${encodeURIComponent(customerId)}/notes`, { method: 'POST', body: note })
    .then((r) => r.data);

export const deleteNote = (id) => request(`/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ---------- Follow-up tasks ----------
/**
 * filters: { status: 'pending'|'completed'|'cancelled'|'all', customer_id, suggestions }
 * Returns { data: Task[], suggestions, summary, triggers }
 */
export const getFollowUps = (filters = {}, opts) =>
  request('/follow-ups', { ...opts, params: filters });

/** task: { customer_id, title, due_date: 'YYYY-MM-DD', priority?, description? } */
export const createFollowUp = (task) =>
  request('/follow-ups', { method: 'POST', body: task }).then((r) => r.data);

/** changes: any of { status, title, description, due_date, priority } */
export const updateFollowUp = (id, changes) =>
  request(`/follow-ups/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes }).then((r) => r.data);

export const deleteFollowUp = (id) =>
  request(`/follow-ups/${encodeURIComponent(id)}`, { method: 'DELETE' });

// ---------- WooCommerce sync ----------
/** Returns { configured, storeUrl, running, lastResult } */
export const getSyncStatus = (opts) => request('/sync', opts).then((r) => r.data);

/** Runs a full import; returns counts of created/updated customers and orders. */
export const runSync = () => request('/sync', { method: 'POST' }).then((r) => r.data);

export const api = {
  getHealth, getDashboardStats, getCustomers, getSegments, getCustomer, getOrders, getOrder,
  getNotes, addNote, deleteNote, getFollowUps, createFollowUp, updateFollowUp, deleteFollowUp,
};

export { BASE_URL };