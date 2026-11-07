'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import { fetchMindMap } from '../api/spaces.api';

export function useMindMap(spaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.spaces.mindMap(spaceId ?? ''),
    queryFn: () => fetchMindMap(spaceId!),
    enabled: Boolean(spaceId),
  });
}
