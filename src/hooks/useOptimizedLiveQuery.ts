import { sameQueryResult } from '@/src/lib/queryEquality';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef } from 'react';

/**
 * A wrapper around useLiveQuery that prevents React re-renders by returning
 * the same reference if the structural result has not changed.
 * This fixes "Over-Fetching & React Re-renders" issues with Dexie returning new arrays.
 */
export function useOptimizedLiveQuery<T>(querier: () => Promise<T> | T, deps?: any[]): T | undefined {
  const result = useLiveQuery(querier, deps);
  const ref = useRef<T | undefined>(undefined);
  const lastResultRef = useRef<T | undefined>(undefined);

  // Compare only new query results, without serializing entire records.
  if (result !== lastResultRef.current) {
    lastResultRef.current = result;
    if (!sameQueryResult(result, ref.current)) {
      ref.current = result;
    }
  }

  return ref.current;
}
