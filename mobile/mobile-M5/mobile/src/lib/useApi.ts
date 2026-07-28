import { useCallback, useEffect, useState } from 'react';

import { apiRequest, ApiError } from './api';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "You don't have access to this.";
    if (err.status === 404) return 'Not found.';
    if (err.status >= 500) return 'Something went wrong on our end. Please try again.';
    return err.message || 'Something went wrong.';
  }
  return 'Could not connect. Check your connection and try again.';
}

/**
 * Shared read hook for every list/detail screen — fetch on mount, expose
 * pull-to-refresh, normalize errors into a display-ready message. Screens
 * should not call apiRequest directly for simple reads; use this so
 * loading/error/refresh states stay consistent across the app.
 */
export function useApi<T>(path: string | null): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!path) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await apiRequest<T>(path);
        setData(result);
      } catch (err) {
        setError(messageFor(err));
      } finally {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [path]
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const refetch = useCallback(() => load(true), [load]);

  return { data, loading, refreshing, error, refetch };
}
