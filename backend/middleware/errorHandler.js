// backend/middleware/errorHandler.js

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express 5 forwards rejected async handlers here automatically.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Internal server error';

  // Translate common MySQL / connection errors into useful responses.
  if (err.code === 'ER_DUP_ENTRY') { status = 409; message = 'Record already exists'; }
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR'].includes(err.code)) {
    status = 503; message = 'Database unavailable';
  }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Malformed JSON body'; }

  if (status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);

  const body = { error: message };
  if (process.env.NODE_ENV !== 'production' && status >= 500) body.details = err.code || err.stack;
  res.status(status).json(body);
}

module.exports = { HttpError, notFound, errorHandler };