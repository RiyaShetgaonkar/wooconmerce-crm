// frontend/src/pages/Dashboard.jsx
import { Link } from 'react-router-dom';
import { getDashboardStats } from '../services/api';
import { useApi } from '../hooks/useApi';
import {
  PageHeader, StatCard, StatusBadge, SegmentBadge, Avatar, Spinner, ErrorState, EmptyState,
} from '../components/ui';
import { formatNumber, formatRelative, fullName } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';
import SyncButton from '../components/SyncButton';

export default function Dashboard() {
  const { money } = useCurrency();
  const { data, loading, error, reload } = useApi((signal) => getDashboardStats({ signal }), []);

  const refreshButton = (
    <>
      <SyncButton onSynced={reload} />
      <button className="btn" onClick={reload} disabled={loading}>
        {loading ? 'Refreshing…' : '↻ Refresh'}
      </button>
    </>
  );

  if (error && !data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <ErrorState error={error} onRetry={reload} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Spinner />
      </>
    );
  }

  const { totals, recentOrders, segments, tasks, topProducts = [] } = data;
  const totalSegmentCustomers = segments.reduce((sum, s) => sum + Number(s.count), 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="A snapshot of your WooCommerce store's customers and orders."
        actions={refreshButton}
      />

      <section className="stat-grid">
        <StatCard
          label="Total customers"
          icon="👥"
          value={formatNumber(totals.totalCustomers)}
          hint={<Link to="/customers">View all customers →</Link>}
        />
        <StatCard
          label="Total orders"
          icon="🧾"
          value={formatNumber(totals.totalOrders)}
          hint={`Avg. order ${money(totals.avgOrderValue)}`}
        />
        <StatCard
          label="Total revenue"
          icon="💰"
          value={money(totals.totalRevenue)}
          hint={`${money(totals.revenueLast30Days)} in the last 30 days`}
        />
        <StatCard
          label="Pending orders"
          icon="⏳"
          value={formatNumber(totals.pendingOrders)}
          hint={<Link to="/orders?status=pending,processing,on-hold">Needs attention →</Link>}
        />
      </section>

      <div className="dash-grid">
        <section className="card">
          <div className="card-header">
            <h2>Recent activity</h2>
            <Link to="/orders" className="link">All orders →</Link>
          </div>
          {recentOrders.length === 0 ? (
            <EmptyState title="No orders yet">Orders synced from WooCommerce will appear here.</EmptyState>
          ) : (
            <ul className="activity-list">
              {recentOrders.map((o) => (
                <li key={o.id} className="activity-item">
                  <Avatar person={o} />
                  <div className="activity-body">
                    <div>
                      <Link to={`/customers/${o.customer_id}`} className="strong-link">{fullName(o)}</Link>
                      <span className="muted"> placed order </span>
                      <span className="mono">#{o.wc_order_id}</span>
                    </div>
                    <div className="items-line" title={o.items_summary || ''}>
                      <span aria-hidden="true">🛍 </span>{o.items_summary || <span className="muted">No item details</span>}
                    </div>
                    <div className="muted small">{formatRelative(o.date_created)}</div>
                  </div>
                  <div className="activity-meta">
                    <span className="amount">{money(o.total, o.currency)}</span>
                    <StatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>Top products</h2>
              <span className="muted small">by units sold</span>
            </div>
            {topProducts.length === 0 ? (
              <p className="muted small empty-hint">No product data yet — run a WooCommerce sync.</p>
            ) : (
              <ol className="product-list">
                {topProducts.map((p, i) => (
                  <li key={p.product_name}>
                    <span className="rank">{i + 1}</span>
                    <Link to={`/orders?search=${encodeURIComponent(p.product_name)}`} className="product-name strong-link">
                      {p.product_name}
                    </Link>
                    <span className="product-stats">
                      <strong>{formatNumber(p.quantity)}</strong> sold
                      <span className="muted small"> · {money(p.revenue)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Customer segments</h2>
              <Link to="/customers" className="link">Manage →</Link>
            </div>
            <ul className="segment-list">
              {segments.map((s) => {
                const share = totalSegmentCustomers ? (Number(s.count) / totalSegmentCustomers) * 100 : 0;
                return (
                  <li key={s.segment}>
                    <Link to={`/customers?segment=${encodeURIComponent(s.segment)}`} className="segment-row">
                      <SegmentBadge segment={s.segment} />
                      <span className="segment-count">
                        {formatNumber(s.count)} <span className="muted small">({share.toFixed(0)}%)</span>
                      </span>
                      <span className="muted small">{money(s.revenue)}</span>
                    </Link>
                    <div className="meter" title={`${share.toFixed(1)}% of customers`}>
                      <span style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Follow-ups</h2>
              <Link to="/follow-ups" className="link">Open tasks →</Link>
            </div>
            <div className="task-summary">
              <div>
                <div className="task-num">{formatNumber(tasks.open_total)}</div>
                <div className="muted small">Open</div>
              </div>
              <div>
                <div className="task-num">{formatNumber(tasks.due_today)}</div>
                <div className="muted small">Due today</div>
              </div>
              <div>
                <div className={`task-num ${tasks.overdue > 0 ? 'text-bad' : ''}`}>
                  {tasks.overdue > 0 && <span aria-hidden="true">⚠ </span>}
                  {formatNumber(tasks.overdue)}
                </div>
                <div className="muted small">Overdue</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
