// frontend/src/components/TaskManager.jsx
// Follow-up task widget: add, check off, reschedule, delete.
// `list` comes from useTaskList(); pass `customerId` to show the "add task" form.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, formatDueDate, fullName, isOverdue, statusLabel } from '../utils/format';

const byDueDate = (a, b) => a.due_date.localeCompare(b.due_date) || a.id - b.id;
const byCompleted = (a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || ''));

function AddTaskForm({ customerId, onAdd }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(addDays(1));
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onAdd({ customer_id: customerId, title: title.trim(), due_date: dueDate, priority });
      setTitle('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="task-form" onSubmit={submit}>
      <input
        className="input grow"
        placeholder="Add a follow-up, e.g. Send discount code"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={255}
        aria-label="Task description"
      />
      <div className="task-form-row">
        <input type="date" className="input" value={dueDate} min={addDays(0)}
          onChange={(e) => setDueDate(e.target.value)} aria-label="Due date" required />
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <button type="submit" className="btn primary" disabled={saving || !title.trim()}>
          {saving ? 'Adding…' : '+ Add'}
        </button>
      </div>
      <div className="chip-row">
        {[['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([label, days]) => (
          <button key={label} type="button" className={`chip ${dueDate === addDays(days) ? 'active' : ''}`}
            onClick={() => setDueDate(addDays(days))}>
            {label}
          </button>
        ))}
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </form>
  );
}

function TaskRow({ task, list, showCustomer }) {
  const [rescheduling, setRescheduling] = useState(false);
  const done = task.status === 'completed';
  const overdue = isOverdue(task);

  return (
    <li className={`task-row ${done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <input
        type="checkbox"
        className="task-check"
        checked={done}
        onChange={() => list.toggle(task)}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
      />
      <div className="task-main">
        <div className="task-title">{task.title}</div>
        <div className="task-meta small">
          <span className={overdue ? 'text-bad' : 'muted'}>
            {overdue && <span aria-hidden="true">⚠ </span>}
            {overdue ? 'Overdue · ' : 'Due '}{formatDueDate(task.due_date)}
          </span>
          {showCustomer && (
            <>
              <span className="muted"> · </span>
              <Link to={`/customers/${task.customer_id}`} className="strong-link">{fullName(task)}</Link>
            </>
          )}
          {task.status === 'cancelled' && <span className="muted"> · Cancelled</span>}
        </div>
        {task.description && <div className="muted small">{task.description}</div>}
        {rescheduling && (
          <div className="chip-row">
            {[['Tomorrow', 1], ['+3 days', 3], ['Next week', 7]].map(([label, days]) => (
              <button key={label} type="button" className="chip"
                onClick={() => { list.reschedule(task, addDays(days)); setRescheduling(false); }}>
                {label}
              </button>
            ))}
            <input type="date" className="input input-sm" defaultValue={task.due_date} min={addDays(0)}
              aria-label="New due date"
              onChange={(e) => { if (e.target.value) { list.reschedule(task, e.target.value); setRescheduling(false); } }} />
          </div>
        )}
      </div>
      <span className={`badge prio-${task.priority}`}>{statusLabel(task.priority)}</span>
      <div className="task-actions">
        {!done && (
          <button className="icon-btn" title="Reschedule" aria-label="Reschedule"
            onClick={() => setRescheduling((v) => !v)}>
            📅
          </button>
        )}
        <button className="icon-btn" title="Delete" aria-label="Delete task"
          onClick={() => window.confirm('Delete this task?') && list.remove(task)}>
          ✕
        </button>
      </div>
    </li>
  );
}

export default function TaskManager({ list, customerId, showCustomer = false, title = 'Follow-up tasks' }) {
  const [tab, setTab] = useState('open');
  const open = list.tasks.filter((t) => t.status === 'pending').sort(byDueDate);
  const closed = list.tasks.filter((t) => t.status !== 'pending').sort(byCompleted);
  const overdueCount = open.filter(isOverdue).length;
  const visible = tab === 'open' ? open : closed;

  return (
    <section className="card">
      <div className="card-header">
        <h2>{title}</h2>
        {overdueCount > 0 && <span className="badge st-bad">⚠ {overdueCount} overdue</span>}
      </div>

      {customerId && <AddTaskForm customerId={customerId} onAdd={list.add} />}

      <div className="segment-tabs compact" role="tablist">
        <button role="tab" aria-selected={tab === 'open'} className={`tab ${tab === 'open' ? 'active' : ''}`}
          onClick={() => setTab('open')}>
          Open <span className="tab-count">{open.length}</span>
        </button>
        <button role="tab" aria-selected={tab === 'done'} className={`tab ${tab === 'done' ? 'active' : ''}`}
          onClick={() => setTab('done')}>
          Done <span className="tab-count">{closed.length}</span>
        </button>
      </div>

      {list.error && (
        <div className="inline-error" role="alert">
          {list.error} <button className="link-btn" onClick={list.clearError}>Dismiss</button>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="muted small empty-hint">
          {tab === 'open' ? 'All caught up — no open follow-ups. 🎉' : 'No completed tasks yet.'}
        </p>
      ) : (
        <ul className="task-list">
          {visible.map((t) => <TaskRow key={t.id} task={t} list={list} showCustomer={showCustomer} />)}
        </ul>
      )}
    </section>
  );
}
