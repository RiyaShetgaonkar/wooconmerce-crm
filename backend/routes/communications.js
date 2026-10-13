// backend/routes/communications.js
// Mounted at /api  ->  interaction notes + follow-up tasks
//
//   GET    /api/customers/:id/notes
//   POST   /api/customers/:id/notes
//   DELETE /api/notes/:id
//   GET    /api/follow-ups            pending tasks + suggested actions
//   POST   /api/follow-ups
//   PATCH  /api/follow-ups/:id        check off, reschedule, edit
//   DELETE /api/follow-ups/:id

const express = require('express');
const { query } = require('../config/db');
const { HttpError } = require('../middleware/errorHandler');
const { str, parseId, parseOptionalDate } = require('../utils/query');
const {
  getTriggerConfig, getTaskById, listTasks, getSuggestions,
} = require('../services/followUps');

const router = express.Router();

const NOTE_TYPES = ['note', 'call', 'email', 'meeting', 'other'];
const PRIORITIES = ['low', 'medium', 'high'];
const TASK_STATUSES = ['pending', 'completed', 'cancelled'];

// ---------- helpers ----------

async function assertCustomerExists(id) {
  const [row] = await query('SELECT id FROM customers WHERE id = ?', [id]);
  if (!row) throw new HttpError(404, 'Customer not found');
}

/** Required/optional trimmed text with a max length. */
function text(value, name, { required = false, max = 255 } = {}) {
  const s = str(value);
  if (required && !s) throw new HttpError(400, `${name} is required`);
  if (s.length > max) throw new HttpError(400, `${name} must be at most ${max} characters`);
  return s;
}

/** Optional enum value (case-insensitive), or the fallback. */
function oneOf(value, allowed, name, fallback) {
  const s = str(value).toLowerCase();
  if (!s) return fallback;
  if (!allowed.includes(s)) throw new HttpError(400, `Invalid ${name}. Use one of: ${allowed.join(', ')}`);
  return s;
}

/** YYYY-MM-DD (or full ISO string, date part kept) -> 'YYYY-MM-DD 00:00:00'. */
function dueDate(value, { required = false } = {}) {
  const raw = str(value).slice(0, 10);
  if (!raw) {
    if (required) throw new HttpError(400, 'due_date is required (YYYY-MM-DD)');
    return null;
  }
  return `${parseOptionalDate(raw, 'due_date')} 00:00:00`;
}

// ---------- notes ----------

const NOTE_COLUMNS = 'id, customer_id, note_type, content, created_by, created_at, updated_at';

router.get('/customers/:id/notes', async (req, res) => {
  const id = parseId(req.params.id, 'customer id');
  await assertCustomerExists(id);
  const notes = await query(
    `SELECT ${NOTE_COLUMNS} FROM interaction_notes WHERE customer_id = ? ORDER BY created_at DESC, id DESC`,
    [id]
  );
  res.json({ data: notes });
});

/** Body: { content | note, note_type?, created_by? } */
router.post('/customers/:id/notes', async (req, res) => {
  const id = parseId(req.params.id, 'customer id');
  const body = req.body || {};
  const content = text(body.content ?? body.note, 'Note', { required: true, max: 5000 });
  const noteType = oneOf(body.note_type, NOTE_TYPES, 'note_type', 'note');
  const createdBy = text(body.created_by, 'created_by', { max: 100 }) || null;

  await assertCustomerExists(id);
  const result = await query(
    'INSERT INTO interaction_notes (customer_id, note_type, content, created_by) VALUES (?, ?, ?, ?)',
    [id, noteType, content, createdBy]
  );
  const [note] = await query(`SELECT ${NOTE_COLUMNS} FROM interaction_notes WHERE id = ?`, [result.insertId]);
  res.status(201).json({ data: note });
});

router.delete('/notes/:id', async (req, res) => {
  const id = parseId(req.params.id, 'note id');
  const result = await query('DELETE FROM interaction_notes WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Note not found');
  res.status(204).end();
});

// ---------- follow-up tasks ----------

/**
 * Query: status (pending | completed | cancelled | all, default pending),
 *        customer_id, suggestions (default true; "false" to skip)
 */
router.get('/follow-ups', async (req, res) => {
  const status = str(req.query.status).toLowerCase() === 'all'
    ? 'all'
    : oneOf(req.query.status, TASK_STATUSES, 'status', 'pending');
  const customerId = str(req.query.customer_id) ? parseId(req.query.customer_id, 'customer_id') : null;
  const withSuggestions = str(req.query.suggestions).toLowerCase() !== 'false';

  const config = getTriggerConfig();
  const [tasks, suggestions] = await Promise.all([
    listTasks({ status, customerId }),
    withSuggestions && !customerId ? getSuggestions(config) : [],
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const pending = tasks.filter((t) => t.status === 'pending');
  res.json({
    data: tasks,
    suggestions,
    summary: {
      pending: pending.length,
      overdue: pending.filter((t) => t.is_overdue).length,
      dueToday: pending.filter((t) => t.due_date === today).length,
    },
    triggers: config,
  });
});

/** Body: { customer_id, title | task_description, description?, due_date, priority? } */
router.post('/follow-ups', async (req, res) => {
  const body = req.body || {};
  const customerId = parseId(body.customer_id, 'customer_id');
  const title = text(body.title ?? body.task_description, 'Task description', { required: true });
  const description = text(body.description, 'description', { max: 5000 }) || null;
  const due = dueDate(body.due_date, { required: true });
  const priority = oneOf(body.priority, PRIORITIES, 'priority', 'medium');

  await assertCustomerExists(customerId);
  const result = await query(
    `INSERT INTO follow_up_tasks (customer_id, title, description, due_date, priority)
     VALUES (?, ?, ?, ?, ?)`,
    [customerId, title, description, due, priority]
  );
  res.status(201).json({ data: await getTaskById(result.insertId) });
});

/** Body (any subset): { status, title | task_description, description, due_date, priority } */
router.patch('/follow-ups/:id', async (req, res) => {
  const id = parseId(req.params.id, 'task id');
  const body = req.body || {};
  const sets = [];
  const params = [];

  if (body.status !== undefined) {
    const status = oneOf(body.status, TASK_STATUSES, 'status');
    if (!status) throw new HttpError(400, 'status cannot be empty');
    sets.push('status = ?', `completed_at = ${status === 'completed' ? 'UTC_TIMESTAMP()' : 'NULL'}`);
    params.push(status);
  }
  const titleInput = body.title ?? body.task_description;
  if (titleInput !== undefined) {
    sets.push('title = ?');
    params.push(text(titleInput, 'Task description', { required: true }));
  }
  if (body.description !== undefined) {
    sets.push('description = ?');
    params.push(text(body.description, 'description', { max: 5000 }) || null);
  }
  if (body.due_date !== undefined) {
    sets.push('due_date = ?');
    params.push(dueDate(body.due_date, { required: true }));
  }
  if (body.priority !== undefined) {
    sets.push('priority = ?');
    params.push(oneOf(body.priority, PRIORITIES, 'priority', 'medium'));
  }
  if (!sets.length) throw new HttpError(400, 'Nothing to update');

  const result = await query(`UPDATE follow_up_tasks SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
  if (!result.affectedRows) throw new HttpError(404, 'Task not found');
  res.json({ data: await getTaskById(id) });
});

router.delete('/follow-ups/:id', async (req, res) => {
  const id = parseId(req.params.id, 'task id');
  const result = await query('DELETE FROM follow_up_tasks WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Task not found');
  res.status(204).end();
});

module.exports = router;
