import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import {
  bulkCreateNotes,
  bulkDeleteNotes,
  bulkMoveNotes,
  bulkRestoreNotes,
  bulkUpdateNotes,
  createNote,
  deleteNote,
  fetchNote,
  fetchNotes,
  updateNoteColor,
  updateNoteContent,
  updateNoteParent,
  updateNotePosition,
  updateNoteType,
} from '../api/notes.api';
import { tidyLayout } from '../../ai/services/layout';
import type { Note as StickyNoteData } from '../../../core/domain';
import type { CreateNoteInput } from '../../../core/ports';
import type { NoteType } from '../../../shared/constants/tokens';

export function useNotes(spaceId: string | null) {
  return useQuery({
    queryKey: queryKeys.notes.bySpace(spaceId ?? ''),
    queryFn: () => fetchNotes(spaceId!),
    enabled: Boolean(spaceId),
  });
}

export function useUpdateNoteColor(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, color }: { noteId: string; color: string }) =>
      updateNoteColor(noteId, color),

    // Recolouring should feel instant — paint it locally, roll back on failure.
    onMutate: async ({ noteId, color }) => {
      await qc.cancelQueries({ queryKey: key });
      await qc.cancelQueries({ queryKey: queryKeys.notes.detail(noteId) });

      const previousList = qc.getQueryData<StickyNoteData[]>(key);
      const previousDetail = qc.getQueryData<StickyNoteData>(queryKeys.notes.detail(noteId));

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => (note.id === noteId ? { ...note, color } : note))
      );

      qc.setQueryData<StickyNoteData>(queryKeys.notes.detail(noteId), (old) =>
        old ? { ...old, color } : old
      );

      return { previousList, previousDetail };
    },
    onError: (_err, { noteId }, context) => {
      if (context?.previousList) qc.setQueryData(key, context.previousList);
      if (context?.previousDetail) qc.setQueryData(queryKeys.notes.detail(noteId), context.previousDetail);
    },
  });
}

export function useMoveNote(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, x, y }: { noteId: string; x: number; y: number }) =>
      updateNotePosition(noteId, x, y),
    onMutate: async ({ noteId, x, y }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => (note.id === noteId ? { ...note, x, y } : note))
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useCreateNote(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (note: CreateNoteInput) =>
      createNote(spaceId!, note),
    onSuccess: (newNote) => {
      qc.setQueryData<StickyNoteData[]>(key, (old) => {
        if (!old) return [newNote];
        if (old.some((n) => n.id === newNote.id)) return old;
        return [...old, newNote];
      });
    },
  });
}

export function useDeleteNote(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onMutate: async (noteId) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).filter((note) => note.id !== noteId)
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

/**
 * Re-flows only the top-level ideas into the 4-column grid, in their current
 * order — a tidy is predictable rather than a reshuffle. Sub-notes aren't
 * regridded (they're connected to their parent by a line, not a slot); they
 * instead shift by the same delta as their ancestor's move, so a cluster
 * stays visually attached instead of the connector line stretching across
 * the board. A few propagation passes cover nesting deeper than one level.
 */
function tidyWithClusters(notes: StickyNoteData[]): StickyNoteData[] {
  const topLevel = notes.filter((n) => !n.parentId);
  const tidiedTopLevel = tidyLayout(topLevel);

  const deltaById = new Map<string, { dx: number; dy: number }>();
  tidiedTopLevel.forEach((n, i) =>
    deltaById.set(n.id, { dx: n.x - topLevel[i].x, dy: n.y - topLevel[i].y })
  );

  for (let pass = 0; pass < 3; pass++) {
    for (const note of notes) {
      if (note.parentId && !deltaById.has(note.id) && deltaById.has(note.parentId)) {
        deltaById.set(note.id, deltaById.get(note.parentId)!);
      }
    }
  }

  return notes.map((note) => {
    const delta = deltaById.get(note.id);
    return delta ? { ...note, x: note.x + delta.dx, y: note.y + delta.dy } : note;
  });
}

export function useTidyNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: async (notes: StickyNoteData[]) => {
      const tidied = tidyWithClusters(notes);
      await bulkMoveNotes(tidied.map(({ id, x, y }) => ({ id, x, y })));
      return tidied;
    },
    // Snap immediately — waiting on a round trip makes the button feel broken.
    onMutate: async (notes) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StickyNoteData[]>(key);
      qc.setQueryData<StickyNoteData[]>(key, tidyWithClusters(notes));
      return { previous };
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
  });
}

/** Update multiple notes positions at once when moving a cluster. */
export function useMoveCluster(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (moves: { id: string; x: number; y: number }[]) => bulkMoveNotes(moves),
    onMutate: async (moves) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StickyNoteData[]>(key);
      const moveMap = new Map(moves.map((m) => [m.id, m]));
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => {
          const move = moveMap.get(note.id);
          return move ? { ...note, x: move.x, y: move.y } : note;
        })
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
  });
}

/** Fetch a single note by id. */
export function useNote(noteId: string | null) {
  return useQuery({
    queryKey: queryKeys.notes.detail(noteId ?? ''),
    queryFn: () => fetchNote(noteId!),
    enabled: Boolean(noteId),
  });
}

/** Update a note's title and body text. */
export function useUpdateNoteContent(spaceId?: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({
      noteId,
      title,
      content,
    }: {
      noteId: string;
      title?: string | null;
      content: string;
    }) => updateNoteContent(noteId, { title, content }),
    onMutate: async ({ noteId, title, content }) => {
      if (spaceId) await qc.cancelQueries({ queryKey: key });
      await qc.cancelQueries({ queryKey: queryKeys.notes.detail(noteId) });

      const previousList = spaceId ? qc.getQueryData<StickyNoteData[]>(key) : undefined;
      const previousDetail = qc.getQueryData<StickyNoteData>(queryKeys.notes.detail(noteId));

      if (spaceId) {
        qc.setQueryData<StickyNoteData[]>(key, (old) =>
          (old ?? []).map((n) =>
            n.id === noteId ? { ...n, title: title !== undefined ? title : n.title, content } : n
          )
        );
      }
      qc.setQueryData<StickyNoteData>(queryKeys.notes.detail(noteId), (old) =>
        old ? { ...old, title: title !== undefined ? title : old.title, content } : old
      );

      return { previousList, previousDetail };
    },
    onError: (_err, { noteId }, context) => {
      if (spaceId && context?.previousList) qc.setQueryData(key, context.previousList);
      if (context?.previousDetail)
        qc.setQueryData(queryKeys.notes.detail(noteId), context.previousDetail);
    },
  });
}

/** Update a note's type tag. */
export function useUpdateNoteType(spaceId?: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, type }: { noteId: string; type: NoteType }) =>
      updateNoteType(noteId, type),
    onMutate: async ({ noteId, type }) => {
      if (spaceId) await qc.cancelQueries({ queryKey: key });
      await qc.cancelQueries({ queryKey: queryKeys.notes.detail(noteId) });

      const previousList = spaceId ? qc.getQueryData<StickyNoteData[]>(key) : undefined;
      const previousDetail = qc.getQueryData<StickyNoteData>(queryKeys.notes.detail(noteId));

      if (spaceId) {
        qc.setQueryData<StickyNoteData[]>(key, (old) =>
          (old ?? []).map((n) => (n.id === noteId ? { ...n, type } : n))
        );
      }
      qc.setQueryData<StickyNoteData>(queryKeys.notes.detail(noteId), (old) =>
        old ? { ...old, type } : old
      );

      return { previousList, previousDetail };
    },
    onError: (_err, { noteId }, context) => {
      if (spaceId && context?.previousList) qc.setQueryData(key, context.previousList);
      if (context?.previousDetail)
        qc.setQueryData(queryKeys.notes.detail(noteId), context.previousDetail);
    },
  });
}

/**
 * Re-parent a note, or detach it with `parentId: null`.
 *
 * Optimistic, because the arrow the user just drew has to snap into place —
 * waiting a round trip to see the connector appear makes the tool feel broken.
 * Callers must run wouldCycle() first: parent_id has no database-level cycle
 * guard, and a ring is unrecoverable from the UI.
 */
export function useSetNoteParent(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, parentId }: { noteId: string; parentId: string | null }) =>
      updateNoteParent(noteId, parentId),

    onMutate: async ({ noteId, parentId }) => {
      await qc.cancelQueries({ queryKey: key });
      await qc.cancelQueries({ queryKey: queryKeys.notes.detail(noteId) });

      const previousList = qc.getQueryData<StickyNoteData[]>(key);
      const previousDetail = qc.getQueryData<StickyNoteData>(queryKeys.notes.detail(noteId));

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => (note.id === noteId ? { ...note, parentId } : note))
      );
      qc.setQueryData<StickyNoteData>(queryKeys.notes.detail(noteId), (old) =>
        old ? { ...old, parentId } : old
      );

      return { previousList, previousDetail };
    },
    onError: (_err, { noteId }, context) => {
      if (context?.previousList) qc.setQueryData(key, context.previousList);
      if (context?.previousDetail) {
        qc.setQueryData(queryKeys.notes.detail(noteId), context.previousDetail);
      }
    },
  });
}

export function useBulkUpdateNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ ids, patch }: { ids: string[]; patch: { color?: string; type?: NoteType } }) =>
      bulkUpdateNotes(ids, patch),
    onMutate: async ({ ids, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);
      const idSet = new Set(ids);
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((n) =>
          idSet.has(n.id)
            ? {
                ...n,
                ...(patch.color !== undefined ? { color: patch.color } : {}),
                ...(patch.type !== undefined ? { type: patch.type } : {}),
              }
            : n
        )
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useBulkDeleteNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (ids: string[]) => bulkDeleteNotes(ids),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);
      const idSet = new Set(ids);
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).filter((n) => !idSet.has(n.id))
      );
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useBulkRestoreNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ ids }: { ids: string[]; notes?: StickyNoteData[] }) => bulkRestoreNotes(ids),
    onMutate: async ({ notes }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);
      if (notes?.length) {
        qc.setQueryData<StickyNoteData[]>(key, (old) => {
          const existingIds = new Set((old ?? []).map((n) => n.id));
          const restored = notes.filter((n) => !existingIds.has(n.id));
          return [...(old ?? []), ...restored];
        });
      }
      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useBulkCreateNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (notes: CreateNoteInput[]) => bulkCreateNotes(spaceId!, notes),
    onSuccess: (created) => {
      qc.setQueryData<StickyNoteData[]>(key, (old) => {
        const existingIds = new Set((old ?? []).map((n) => n.id));
        const fresh = created.filter((n) => !existingIds.has(n.id));
        return [...(old ?? []), ...fresh];
      });
    },
  });
}

