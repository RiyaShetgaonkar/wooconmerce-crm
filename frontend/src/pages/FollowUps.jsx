// frontend/src/pages/FollowUps.jsx
// All follow-up tasks + rule-based suggestions that can be turned into tasks in one click.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getFollowUps } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useTaskList } from '../hooks/useTaskList';
import { PageHeader, Avatar, Spinner, ErrorState } from '../components/ui';
import TaskManager from '../components/TaskManager';
import { addDays, formatRelative, fullName, statusLabel } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';

const RULES = {
  unresolved_order: { icon: '🧾', label: 'Unresolved order', dueIn: 0 },
  high_value_no_contact: { icon: '★', label: 'VIP not contacted', dueIn: 1 },
  lapsed_customer: { icon: '💤', label: 'Win-back', dueIn: 3 },
};

export default function FollowUps() {
  const { data, error, loading, reload } = useApi(
    (signal) => getFollowUps({ status: 'all' }, { signal }).then((r) => ({ ...r, loadedAt: Date.now() })),
    []
  );

  const refresh = (
    <button className="btn" onClick={reload} disabled={loading}>
      {loading ? 'Refreshing…' : '↻ Refresh'}
    </button>
  );

  return (
    <>
      <PageHeader
        title="Follow-ups"
        subtitle="Your task list, plus customers the CRM thinks you should reach out to."
        actions={refresh}
      />
      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : (
        <Board key={data.loadedAt} data={data} />
      )}
    </>
  );
}

function Board({ data }) {
  const { money } = useCurrency();
  const tasks = useTaskList(data.data);
  const [suggestions, setSuggestions] = useState(data.suggestions);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const { triggers } = data;

  async function accept(s) {
    setBusyId(s.customer_id);
    setError(null);
    try {
      await tasks.add({
        customer_id: s.customer_id,
        title: s.suggested_title,
        description: s.reason,
        due_date: addDays(RULES[s.type]?.dueIn ?? 1),
        priority: s.priority,
      });
      setSuggestions((list) => list.filter((x) => x.customer_id !== s.customer_id));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const dismiss = (s) => setSuggestions((list) => list.filter((x) => x.customer_id !== s.customer_id));

  return (
    <div className="dash-grid">
      <TaskManager list={tasks} showCustomer title="All follow-up tasks" />

      <section className="card">
        <div className="card-header">
          <h2>Suggested actions</h2>
          <span className="muted small">{suggestions.length}</span>
        </div>
        <p className="muted small rules-hint">
          Unresolved orders older than {triggers.unresolvedAfterHours}h · High-Value customers not contacted
          in {triggers.contactGapDays} days · Repeat buyers inactive for {triggers.lapsedDays}+ days.
          Customers with an open task are skipped.
        </p>
        {error && <div className="inline-error" role="alert">{error}</div>}

        {suggestions.length === 0 ? (
          <p className="muted small empty-hint">No suggestions right now — nice work. ✨</p>
        ) : (
          <ul className="suggestion-list">
            {suggestions.map((s) => {
              const rule = RULES[s.type] || { icon: '•', label: s.type };
              return (
                <li key={s.customer_id} className="suggestion">
                  <div className="suggestion-head">
                    <Avatar person={s} />
                    <div className="grow-1">
                      <Link to={`/customers/${s.customer_id}`} className="strong-link">{fullName(s)}</Link>
                      <div className="muted small">{s.email}</div>
                    </div>
                    <span className={`badge prio-${s.priority}`}>
                      <span aria-hidden="true">{rule.icon}</span> {rule.label}
                    </span>
                  </div>
                  <div className="small">{s.reason}</div>
                  <div className="muted small">
                    {money(s.amount)} {s.type === 'unresolved_order' ? 'at stake' : 'lifetime spend'}
                    {s.since && <> · {s.type === 'unresolved_order' ? 'since' : 'last'} {formatRelative(s.since)}</>}
                  </div>
                  <div className="suggestion-actions">
                    <button className="btn primary" disabled={busyId === s.customer_id} onClick={() => accept(s)}>
                      {busyId === s.customer_id ? 'Creating…' : `+ Task: ${s.suggested_title}`}
                    </button>
                    <button className="btn ghost" onClick={() => dismiss(s)}>Dismiss</button>
                  </div>
                  <span className="sr-only">Priority {statusLabel(s.priority)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
