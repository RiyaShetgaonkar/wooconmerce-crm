// frontend/src/hooks/useCurrency.js
// App-wide display currency ($ USD / ₹ INR). Amounts from the API are in the
// store's base currency and converted for display; the choice and the
// exchange rate are remembered in localStorage.
import { useSyncExternalStore } from 'react';
import { formatMoney } from '../utils/format';

/** Currency WooCommerce amounts are stored in (orders also carry their own). */
export const BASE_CURRENCY = (import.meta.env.VITE_STORE_CURRENCY || 'USD').toUpperCase();
const DEFAULT_INR_PER_USD = Number(import.meta.env.VITE_INR_PER_USD) || 88;

export const CURRENCIES = {
  USD: { code: 'USD', symbol: '$', label: 'USD', locale: 'en-US', decimals: 2 },
  INR: { code: 'INR', symbol: '₹', label: 'INR', locale: 'en-IN', decimals: 0 },
};

const STORAGE_KEY = 'woo-crm.currency';
const listeners = new Set();

function load() {
  const fallback = { currency: BASE_CURRENCY in CURRENCIES ? BASE_CURRENCY : 'USD', inrPerUsd: DEFAULT_INR_PER_USD };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      currency: CURRENCIES[saved?.currency] ? saved.currency : fallback.currency,
      inrPerUsd: Number(saved?.inrPerUsd) > 0 ? Number(saved.inrPerUsd) : fallback.inrPerUsd,
    };
  } catch {
    return fallback;
  }
}

let state = load();

function setState(patch) {
  state = { ...state, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach((fn) => fn());
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Value of 1 unit of `code`, expressed in USD. */
const usdPer = (code, inrPerUsd) => (code === 'INR' ? 1 / inrPerUsd : 1);

export function useCurrency() {
  const { currency, inrPerUsd } = useSyncExternalStore(subscribe, () => state);
  const meta = CURRENCIES[currency];

  /** Convert `value` from `from` (default: base currency) into the display currency. */
  const convert = (value, from = BASE_CURRENCY) => {
    const source = CURRENCIES[from] ? from : BASE_CURRENCY;
    return ((Number(value) || 0) * usdPer(source, inrPerUsd)) / usdPer(currency, inrPerUsd);
  };

  return {
    currency,
    symbol: meta.symbol,
    inrPerUsd,
    setCurrency: (code) => setState({ currency: code }),
    setRate: (rate) => Number(rate) > 0 && setState({ inrPerUsd: Number(rate) }),

    /** Format an API amount in the selected display currency. */
    money: (value, from) => formatMoney(convert(value, from), currency, {
      locale: meta.locale, decimals: meta.decimals,
    }),

    /** Turn a number the user typed (display currency) into base currency for API filters. */
    toBase: (value) => {
      if (value === '' || value == null) return '';
      const n = Number(value);
      if (!Number.isFinite(n)) return value;
      return Math.round(((n * usdPer(currency, inrPerUsd)) / usdPer(BASE_CURRENCY, inrPerUsd)) * 100) / 100;
    },
  };
}
