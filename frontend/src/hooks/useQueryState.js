// frontend/src/hooks/useQueryState.js
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Filters stored in the URL (?search=..&segment=..) so views are shareable
 * and survive refresh. Changing any filter except `page` resets to page 1.
 */
export function useQueryState(defaults) {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const out = { ...defaults };
    Object.keys(defaults).forEach((key) => {
      const v = searchParams.get(key);
      if (v !== null) out[key] = v;
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const update = useCallback(
    (patch) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === '' || value == null || String(value) === String(defaults[key])) next.delete(key);
            else next.set(key, String(value));
          });
          if (!('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true }
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSearchParams]
  );

  return [values, update];
}
