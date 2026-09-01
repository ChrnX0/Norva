import { useCallback, useEffect, useState } from 'react';

/**
 * Reading from the device database, with the two states a screen actually has
 * to draw: still loading, and failed.
 *
 * Deliberately small - a data-fetching library here would be weight for
 * nothing, since every query is a local SQLite call that answers in
 * milliseconds and never needs a network retry policy.
 */
export function useQuery<T>(
  run: () => Promise<T>,
  deps: readonly unknown[] = [],
): { data: T | null; loading: boolean; error: Error | null; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  // The query function is rebuilt on every render; the caller's deps decide
  // when it should actually run again.
  const memo = useCallback(run, deps);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    memo()
      .then((value) => {
        if (!alive) return;
        setData(value);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [memo, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}
