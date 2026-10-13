// frontend/src/components/SyncButton.jsx
// "Sync WooCommerce" button with last-sync info. Calls onSynced() after a successful import.
import { useState } from 'react';
import { getSyncStatus, runSync } from '../services/api';
import { useApi } from '../hooks/useApi';
import { formatRelative } from '../utils/format';

export default function SyncButton({ onSynced }) {
  const { data: status, reload } = useApi((signal) => getSyncStatus({ signal }), []);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  if (!status) return null;

  if (!status.configured) {
    return (
      <span className="muted small" title="Set WC_STORE_URL, WC_CONSUMER_KEY and WC_CONSUMER_SECRET in backend/.env">
        WooCommerce not connected
      </span>
    );
  }

  async function sync() {
    setSyncing(true);
    setMessage(null);
    try {
      const r = await runSync();
      setMessage({
        ok: true,
        text: `Synced ${r.fetched.orders} orders (${r.ordersCreated} new) and ${r.fetched.customers} customers`,
      });
      onSynced?.();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setSyncing(false);
      reload();
    }
  }

  const last = status.lastResult;
  return (
    <div className="sync-box">
      <button className="btn primary" onClick={sync} disabled={syncing || status.running}>
        {syncing || status.running ? 'Syncing…' : '⇅ Sync WooCommerce'}
      </button>
      <span className={`small ${message && !message.ok ? 'text-bad' : 'muted'}`} role="status">
        {message?.text
          || (last ? `Last sync ${formatRelative(last.finishedAt)}${last.ok ? '' : ' (failed)'}` : status.storeUrl)}
      </span>
    </div>
  );
}
