import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import {
  fetchModelPreferences,
  fetchModels,
  setModelPreference,
  type ModelKind,
} from '../api/models.api';

const PREFS_KEY = ['models', 'preferences'] as const;

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models.all,
    queryFn: fetchModels,
    // The catalogue changes when we ship, not while the app is open.
    staleTime: 1000 * 60 * 60,
  });
}

export function useModelPreferences() {
  return useQuery({ queryKey: PREFS_KEY, queryFn: fetchModelPreferences });
}

export function useSetModelPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, modelRowId }: { kind: ModelKind; modelRowId: string | null }) =>
      setModelPreference(kind, modelRowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: PREFS_KEY }),
  });
}
