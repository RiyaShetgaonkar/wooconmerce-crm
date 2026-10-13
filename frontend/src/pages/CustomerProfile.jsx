// frontend/src/pages/CustomerProfile.jsx
import { Link, useParams } from 'react-router-dom';
import { getCustomer } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useTaskList } from '../hooks/useTaskList';
import {
  PageHeader, StatCard, SegmentBadge, StatusBadge, Avatar, Spinner, ErrorState, EmptyState,
} from '../components/ui';
import NotesPanel from '../components/NotesPanel';
import TaskManager from '../components/TaskManager';
import { formatNumber, formatDate, fullName } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';

const back = <Link to="/customers" className="link">← Back to customers</Link>;

export default function CustomerProfile() {
  const { id } = useParams();
  const { data: c, error, reload } = useApi((signal) => getCustomer(id, { signal }), [id]);

  if (error) {
    return (
      <>
        <PageHeader title="Customer" actions={back} />
        {error.status === 404
          ? <EmptyState title="Customer not found">It may have been removed in WooCommerce.</EmptyState>
          : <ErrorState error={error} onRetry={reload} />}
      </>
    );
  }
  if (!c || String(c.id) !== id) return <Spinner label="Loading profile…" />;

  // Keyed so notes/tasks state resets when navigating between customers.
  return <ProfileContent key={c.id} customer={c} />;
}

function ProfileContent({ customer: c }) {
  const { money } = useCurrency();
  const tasks = useTaskList(c.tasks);

  return (
    <>
      <PageHeader
        title={
          <span className="profile-title">
            <Avatar person={c} />
            {fullName(c)}
            <SegmentBadge segment={c.segment} />
          </span>
        }
        subtitle={[c.email, c.phone, `Customer since ${formatDate(c.created_at)}`].filter(Boolean).join(' · ')}
        actions={back}
      />

      <section className="stat-grid">
        <StatCard label="Total spent" value={money(c.total_spent)} />
        <StatCard label="Orders" value={formatNumber(c.order_count)} />
        <StatCard label="Avg. order value" value={money(c.avg_order_value)} />
        <StatCard label="Last order" value={formatDate(c.last_order_date)} />
      </section>

      <div className="dash-grid">
        <div className="stack">
          <NotesPanel customerId={c.id} initialNotes={c.notes} />

          <section className="card">
            <div className="card-header"><h2>Purchase history</h2></div>
            {c.orders.length === 0 ? (
              <EmptyState title="No orders yet" />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Order</th><th>Items</th><th>Date</th><th>Status</th><th className="num">Total</th></tr>
                  </thead>
                  <tbody>
                    {c.orders.map((o) => (
                      <tr key={o.id}>
                        <td className="mono strong">#{o.wc_order_id}</td>
                        <td className="items-cell">{o.items_summary || <span className="muted">—</span>}</td>
                        <td>{formatDate(o.date_created, true)}</td>
                        <td><StatusBadge status={o.status} /></td>
                        <td className="num amount">{money(o.total, o.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="stack">
          <TaskManager list={tasks} customerId={c.id} />
        </div>
      </div>
    </>
  );
}
