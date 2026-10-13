import { useCallback, useEffect, useState } from 'react';
import { getTrails } from '../services/trailService';

export function useTrails() {
  const [trails, setTrails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setTrails(await getTrails());
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { trails, loading, error, refetch: load };
}