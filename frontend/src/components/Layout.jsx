// frontend/src/components/Layout.jsx
import { NavLink, Outlet } from 'react-router-dom';
import { getHealth } from '../services/api';
import { useApi, useInterval } from '../hooks/useApi';
import CurrencySwitch from './CurrencySwitch';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/customers', label: 'Customers', icon: '👥' },
  { to: '/orders', label: 'Orders', icon: '🧾' },
  { to: '/follow-ups', label: 'Follow-ups', icon: '✅' },
];

function ApiStatus() {
  const { data, error, reload } = useApi((signal) => getHealth({ signal }), []);
  useInterval(reload, 60_000);
  const ok = data?.status === 'ok' && !error;
  return (
    <div className={`api-status ${ok ? 'ok' : 'down'}`} title={error?.message}>
      <span className="live-dot on" aria-hidden="true" />
      {ok ? 'API connected' : data || error ? 'API offline' : 'Connecting…'}
    </div>
  );
}

export default function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">W</span>
          <span>Woo CRM</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span aria-hidden="true">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <CurrencySwitch />
        <ApiStatus />
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
