// backend/utils/query.js
// Small helpers for building safe, parameterized SQL from request input.

const { HttpError } = require('../middleware/errorHandler');

/** "?, ?, ?" for an IN (...) clause. */
const placeholders = (arr) => arr.map(() => '?').join(', ');

/** Escape %, _ and \ so user input is matched literally inside LIKE. */
const escapeLike = (str) => String(str).replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** First value of a query param as a trimmed string ('' if missing). */
const str = (value) => (Array.isArray(value) ? value[0] : value ?? '').toString().trim();

/** Positive integer route/query id, or throws 400. */
function parseId(value, name = 'id') {
  const s = str(value);
  if (!/^\d+$/.test(s) || Number(s) <= 0) throw new HttpError(400, `Invalid ${name}`);
  return Number(s);
}

/** Validated page/limit/offset (integers, safe to interpolate into LIMIT). */
function parsePagination(q, { defaultLimit = 20, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(str(q.page), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(str(q.limit), 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Optional non-negative number from a query param; throws 400 if malformed. */
function parseOptionalNumber(value, name) {
  const s = str(value);
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Invalid ${name}`);
  return n;
}

/** Optional YYYY-MM-DD date; throws 400 if malformed. */
function parseOptionalDate(value, name) {
  const s = str(value);
  if (s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw new HttpError(400, `Invalid ${name} (expected YYYY-MM-DD)`);
  }
  return s;
}

/** Build the pagination block returned with list responses. */
const paginationMeta = (page, limit, total) => ({
  page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)),
});

module.exports = {
  placeholders, escapeLike, str, parseId, parsePagination,
  parseOptionalNumber, parseOptionalDate, paginationMeta,
};