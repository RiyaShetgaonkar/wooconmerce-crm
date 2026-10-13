// frontend/src/hooks/useApi.js
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Runs fetcher(signal) whenever `deps` change and aborts stale requests.
 * Previous data is kept while reloading so tables don't flash empty.
 *
 *   const { data, loading, error, reload } = useApi((signal) => getOrders(filters, { signal }), [key]);
 */
export function useApi(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [reloadKey, setReloadKey] = useState(0);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => { fetcherRef.current = fetcher; });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    fetcherRef.current(controller.signal)
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setState((s) => ({ ...s, loading: false, error }));
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { ...state, reload };
}

/** Returns `value` once it has stopped changing for `delay` ms. */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Calls `callback` every `ms` while `enabled` and the tab is visible. */
export function useInterval(callback, ms, enabled = true) {
  const cbRef = useRef(callback);
  useLayoutEffect(() => { cbRef.current = callback; });
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') cbRef.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}
