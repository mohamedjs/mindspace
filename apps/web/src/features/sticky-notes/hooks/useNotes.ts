'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import {
  bulkMoveNotes,
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

export function useMoveNote(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, x, y }: { noteId: string; x: number; y: number }) =>
      updateNotePosition(noteId, x, y),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateNote(spaceId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (note: { content: string; x: number; y: number; parentId?: string | null }) =>
      createNote(spaceId!, note),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') }),
  });
}

export function useDeleteNote(spaceId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (noteId: string) => deleteNote(noteId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId ?? '') }),
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
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
export function useUpdateNoteContent() {
  const qc = useQueryClient();

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
    onSuccess: () => {
      // Invalidate both the single-note and the parent space list caches
      // so the canvas sees the updated text immediately on back-nav.
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

/** Update a note's type tag. */
export function useUpdateNoteType() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ noteId, type }: { noteId: string; type: NoteType }) =>
      updateNoteType(noteId, type),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

/** Re-parent a note or detach it with parentId = null. */
export function useSetNoteParent(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, parentId }: { noteId: string; parentId: string | null }) =>
      updateNoteParent(noteId, parentId),
    onMutate: async ({ noteId, parentId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StickyNoteData[]>(key);

      if (previous) {
        qc.setQueryData<StickyNoteData[]>(
          key,
          previous.map((n) => (n.id === noteId ? { ...n, parentId } : n))
        );
      }

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });
}

