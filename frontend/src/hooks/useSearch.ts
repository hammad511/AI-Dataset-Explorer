/**
 * Custom hook for search functionality
 */

'use client';

import { useState, useCallback } from 'react';
import type { SearchParams } from '@/utils/apiClient';
import { searchResources } from '@/utils/apiClient';

export interface SearchResult {
  datasets: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
}

export function useSearch() {
  const [results, setResults] = useState<SearchResult>({
    datasets: [],
    models: [],
    loading: false,
    error: null,
  });

  const search = useCallback(async (params: SearchParams) => {
    setResults((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await searchResources(params);

      if (response.success && response.data) {
        setResults({
          datasets: ((response.data as Record<string, unknown[]>).datasets ?? []) as Array<Record<string, unknown>>,
          models: ((response.data as Record<string, unknown[]>).models ?? []) as Array<Record<string, unknown>>,
          loading: false,
          error: null,
        });
      } else {
        setResults((prev) => ({
          ...prev,
          loading: false,
          error: response.error || 'Search failed',
        }));
      }
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setResults({
      datasets: [],
      models: [],
      loading: false,
      error: null,
    });
  }, []);

  return { ...results, search, reset };
}
