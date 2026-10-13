// frontend/src/components/ui.jsx
// Small shared building blocks used by every page.
import { initials, statusLabel } from '../utils/format';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, hint, icon }) {
  return (
    <div className="card stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className="stat-icon" aria-hidden="true">{icon}</span>}
      </div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

const SEGMENT_CLASS = { New: 'seg-new', Repeat: 'seg-repeat', 'High-Value': 'seg-high' };

export function SegmentBadge({ segment }) {
  return <span className={`badge ${SEGMENT_CLASS[segment] || ''}`}>{segment || 'New'}</span>;
}

const STATUS_CLASS = {
  completed: 'st-good',
  processing: 'st-info',
  'on-hold': 'st-warn',
  pending: 'st-warn',
  cancelled: 'st-muted',
  refunded: 'st-muted',
  failed: 'st-bad',
};

export function StatusBadge({ status }) {
  return (
    <span className={`badge status ${STATUS_CLASS[status] || 'st-muted'}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}

export function Avatar({ person }) {
  return <span className="avatar" aria-hidden="true">{initials(person)}</span>;
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="state">
      <span className="spinner" aria-hidden="true" />
      <span className="muted">{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const offline = error?.status === 0;
  return (
    <div className="state error-state" role="alert">
      <strong>{offline ? 'Backend not reachable' : 'Something went wrong'}</strong>
      <span className="muted">
        {error?.message}
        {offline && ' Start it with "npm start" in /backend.'}
      </span>
      {onRetry && <button className="btn" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', children }) {
  return (
    <div className="state">
      <strong>{title}</strong>
      {children && <span className="muted">{children}</span>}
    </div>
  );
}

export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.total === 0) return null;
  const { page, limit, total, totalPages } = pagination;
  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  return (
    <div className="pagination">
      <span className="muted">
        Showing {from}–{to} of {total}
      </span>
      <div className="pagination-buttons">
        <button className="btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ← Prev
        </button>
        <span className="muted">Page {page} / {totalPages}</span>
        <button className="btn" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next →
        </button>
      </div>
    </div>
  );
}

/** Clickable column header that toggles asc/desc. */
export function SortHeader({ label, field, sort, order, onSort, align }) {
  const active = sort === field;
  const arrow = active ? (order === 'asc' ? '↑' : '↓') : '';
  return (
    <th className={align === 'right' ? 'num' : undefined} aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button className="th-sort" onClick={() => onSort(field)}>
        {label} <span className="sort-arrow">{arrow}</span>
      </button>
    </th>
  );
}
