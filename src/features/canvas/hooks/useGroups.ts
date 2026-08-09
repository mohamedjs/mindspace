import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import {
  createGroup,
  deleteGroup,
  fetchGroups,
  updateGroup,
  type NoteGroup,
} from '../api/groups.api';

export function useGroups(spaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.groups.bySpace(spaceId ?? ''),
    queryFn: () => fetchGroups(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function useCreateGroup(spaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (group: { title?: string | null; x: number; y: number }) =>
      createGroup(spaceId!, group),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.groups.bySpace(spaceId ?? '') }),
  });
}

export function useUpdateGroup(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.groups.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ groupId, ...fields }: { groupId: string } & Partial<NoteGroup>) =>
      updateGroup(groupId, fields),

    // Dragging a frame or renaming it should land instantly; a round trip
    // would make the title input fight the user's typing.
    onMutate: async ({ groupId, ...fields }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NoteGroup[]>(key);
      qc.setQueryData<NoteGroup[]>(key, (old) =>
        (old ?? []).map((g) => (g.id === groupId ? { ...g, ...fields } : g))
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteGroup(spaceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.groups.bySpace(spaceId ?? '') }),
  });
}
