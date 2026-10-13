// frontend/src/pages/Customers.jsx
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCustomers, getSegments } from '../services/api';
import { useApi, useDebounce } from '../hooks/useApi';
import { useQueryState } from '../hooks/useQueryState';
import {
  PageHeader, SegmentBadge, Avatar, Spinner, ErrorState, EmptyState, Pagination, SortHeader,
} from '../components/ui';
import { formatNumber, formatDate, fullName, SEGMENTS } from '../utils/format';
import { useCurrency } from '../hooks/useCurrency';

const DEFAULTS = {
  search: '', segment: '', min_spent: '', min_orders: '',
  sort: 'total_spent', order: 'desc', page: '1',
};

export default function Customers() {
  const { money, symbol, toBase } = useCurrency();
  const navigate = useNavigate();
  const [filters, setFilters] = useQueryState(DEFAULTS);

  // Search box is local state, pushed to the URL after the user stops typing.
  const [searchInput, setSearchInput] = useState(filters.search);
  const debouncedSearch = useDebounce(searchInput, 350);
  useEffect(() => {
    if (debouncedSearch !== filters.search) setFilters({ search: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);
  // Keep the input in sync when the URL changes elsewhere (e.g. "Clear filters").
  useEffect(() => setSearchInput(filters.search), [filters.search]);

  const minSpent = toBase(filters.min_spent); // typed in the display currency
  const key = JSON.stringify({ ...filters, minSpent });
  const { data, loading, error, reload } = useApi(
    (signal) => getCustomers({ ...filters, min_spent: minSpent, limit: 20 }, { signal }),
    [key]
  );
  const segmentsReq = useApi((signal) => getSegments({ signal }), []);
  const segmentCounts = Object.fromEntries((segmentsReq.data?.data || []).map((s) => [s.segment, s.count]));
  const thresholds = segmentsReq.data?.thresholds;

  const onSort = (field) =>
    setFilters({ sort: field, order: filters.sort === field && filters.order === 'desc' ? 'asc' : 'desc' });

  const hasFilters = filters.search || filters.segment || filters.min_spent || filters.min_orders;
  const customers = data?.data || [];
  const sortProps = { sort: filters.sort, order: filters.order, onSort };

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={
          thresholds
            ? `Segments: High-Value ≥ ${money(thresholds.highValueSpend)} spent · Repeat ≥ ${thresholds.repeatOrders} orders`
            : 'Search, segment and drill into your customer base.'
        }
      />

      <div className="segment-tabs" role="tablist" aria-label="Filter by segment">
        {['', ...SEGMENTS].map((seg) => (
          <button
            key={seg || 'all'}
            role="tab"
            aria-selected={filters.segment === seg}
            className={`tab ${filters.segment === seg ? 'active' : ''}`}
            onClick={() => setFilters({ segment: seg })}
          >
            {seg || 'All customers'}
            {seg && segmentCounts[seg] != null && <span className="tab-count">{segmentCounts[seg]}</span>}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            type="search"
            className="input grow"
            placeholder="Search by name, email or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search customers"
          />
          <select
            className="input"
            value={filters.segment}
            onChange={(e) => setFilters({ segment: e.target.value })}
            aria-label="Segment"
          >
            <option value="">All segments</option>
            {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="number"
            min="0"
            className="input narrow"
            placeholder={`Min spend (${symbol})`}
            value={filters.min_spent}
            onChange={(e) => setFilters({ min_spent: e.target.value })}
            aria-label="Minimum spend"
          />
          <input
            type="number"
            min="0"
            className="input narrow"
            placeholder="Min orders"
            value={filters.min_orders}
            onChange={(e) => setFilters({ min_orders: e.target.value })}
            aria-label="Minimum orders"
          />
          {hasFilters && (
            <button
              className="btn ghost"
              onClick={() => setFilters({ search: '', segment: '', min_spent: '', min_orders: '' })}
            >
              Clear filters
            </button>
          )}
        </div>

        {error && !data ? (
          <ErrorState error={error} onRetry={reload} />
        ) : !data ? (
          <Spinner label="Loading customers…" />
        ) : customers.length === 0 ? (
          <EmptyState title="No customers found">
            {hasFilters ? 'Try a different search or segment.' : 'Sync customers from WooCommerce to get started.'}
          </EmptyState>
        ) : (
          <div className={`table-wrap ${loading ? 'is-loading' : ''}`}>
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label="Customer" field="name" {...sortProps} />
                  <th>Contact</th>
                  <th>Segment</th>
                  <SortHeader label="Orders" field="order_count" align="right" {...sortProps} />
                  <SortHeader label="Total spent" field="total_spent" align="right" {...sortProps} />
                  <SortHeader label="Last order" field="last_order_date" {...sortProps} />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td>
                      <div className="cell-person">
                        <Avatar person={c} />
                        <Link to={`/customers/${c.id}`} className="strong-link" onClick={(e) => e.stopPropagation()}>
                          {fullName(c)}
                        </Link>
                      </div>
                    </td>
                    <td>
                      <div>{c.email}</div>
                      <div className="muted small">{c.phone || '—'}</div>
                    </td>
                    <td><SegmentBadge segment={c.segment} /></td>
                    <td className="num">{formatNumber(c.order_count)}</td>
                    <td className="num amount">{money(c.total_spent)}</td>
                    <td className="muted">{formatDate(c.last_order_date)}</td>
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
