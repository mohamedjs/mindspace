import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      gcTime: SEVEN_DAYS_MS,
      retry: 2,
    },
    mutations: {
      networkMode: 'offlineFirst',
    },
  },
});

export function createPersister() {
  if (typeof window === 'undefined') return undefined;
  return createSyncStoragePersister({
    storage: window.localStorage,
    key: 'mindspace-query-cache',
  });
}
