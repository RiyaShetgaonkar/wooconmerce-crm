// frontend/src/pages/Orders.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getOrders } from '../services/api';
import { useApi, useDebounce, useInterval } from '../hooks/useApi';
import { useQueryState } from '../hooks/useQueryState';
import {
  PageHeader, StatusBadge, Avatar, Spinner, ErrorState, EmptyState, Pagination, SortHeader,
} from '../components/ui';
import { formatDate, formatRelative, fullName, ORDER_STATUSES, statusLabel } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';

const REFRESH_MS = 30_000;
const NEEDS_ATTENTION = 'pending,processing,on-hold';

const DEFAULTS = {
  search: '', status: '', from: '', to: '', min_total: '',
  sort: 'date_created', order: 'desc', page: '1',
};

export default function Orders() {
  const { money, symbol, toBase } = useCurrency();
  const [filters, setFilters] = useQueryState(DEFAULTS);
  const [live, setLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 350);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  useEffect(() => setSearchInput(filters.search), [filters.search]);

  const minTotal = toBase(filters.min_total); // typed in the display currency
  const key = JSON.stringify({ ...filters, minTotal });
  const { data, loading, error, reload } = useApi(
    (signal) => getOrders({ ...filters, min_total: minTotal, limit: 25 }, { signal }).then((res) => {
      setLastUpdated(new Date());
      return res;
    }),
    [key]
  );

  // "Live" mode: re-poll so status changes from WooCommerce show up without a reload.
  useInterval(reload, REFRESH_MS, live);

  const onSort = (field) =>
    setFilters({ sort: field, order: filters.sort === field && filters.order === 'desc' ? 'asc' : 'desc' });
  const sortProps = { sort: filters.sort, order: filters.order, onSort };

  const hasFilters = filters.search || filters.status || filters.from || filters.to || filters.min_total;
  const orders = data?.data || [];
  const statusOptions = [
    { value: '', label: 'All' },
    { value: NEEDS_ATTENTION, label: 'Needs attention' },
    ...ORDER_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Track WooCommerce orders and their current status."
        actions={
          <>
            <label className="live-toggle">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span className={`live-dot ${live ? 'on' : ''}`} aria-hidden="true" />
              Live
            </label>
            <span className="muted small">
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : ''}
            </span>
            <button className="btn" onClick={reload} disabled={loading}>
              {loading ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </>
        }
      />

      <div className="segment-tabs" role="tablist" aria-label="Filter by status">
        {statusOptions.map((opt) => (
          <button
            key={opt.value || 'all'}
            role="tab"
            aria-selected={filters.status === opt.value}
            className={`tab ${filters.status === opt.value ? 'active' : ''}`}
            onClick={() => setFilters({ status: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            className="input grow"
            placeholder="Search order #, customer name or email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search orders"
          />
          <label className="field">
            <span className="muted small">From</span>
            <input type="date" className="input" value={filters.from} max={filters.to || undefined}
              onChange={(e) => setFilters({ from: e.target.value })} />
          </label>
          <label className="field">
            <span className="muted small">To</span>
            <input type="date" className="input" value={filters.to} min={filters.from || undefined}
              onChange={(e) => setFilters({ to: e.target.value })} />
          </label>
          <input
            type="number"
            min="0"
            className="input narrow"
            placeholder={`Min total (${symbol})`}
            value={filters.min_total}
            onChange={(e) => setFilters({ min_total: e.target.value })}
            aria-label="Minimum order total"
          />
          {hasFilters && (
            <button
              className="btn ghost"
              onClick={() => setFilters({ search: '', status: '', from: '', to: '', min_total: '' })}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && (data ? (
          <div className="inline-error" role="alert">Couldn't refresh: {error.message}</div>
        ) : (
          <ErrorState error={error} onRetry={reload} />
        ))}

        {!error && !data && <Spinner label="Loading orders…" />}

        {data && orders.length === 0 && (
          <EmptyState title="No orders found">
            {hasFilters ? 'Try widening your filters.' : 'Orders synced from WooCommerce will appear here.'}
          </EmptyState>
        )}

        {orders.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Order" field="wc_order_id" {...sortProps} />
                  <th>Customer</th>
                  <SortHeader label="Date" field="date_created" {...sortProps} />
                  <SortHeader label="Status" field="status" {...sortProps} />
                  <SortHeader label="Total" field="total" align="right" {...sortProps} />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono strong">#{o.wc_order_id}</td>
                    <td>
                      <div className="cell-person">
                        <Avatar person={o} />
                        <div>
                          <Link to={`/customers/${o.customer_id}`} className="strong-link">{fullName(o)}</Link>
                          <div className="muted small">{o.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div>{formatDate(o.date_created, true)}</div>
                      <div className="muted small">{formatRelative(o.date_created)}</div>
                    </td>
                    <td><StatusBadge status={o.status} /></td>
                    <td className="num amount">{money(o.total, o.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination pagination={data?.pagination} onPageChange={(page) => setFilters({ page })} />
      </div>
    </>
  );
}
