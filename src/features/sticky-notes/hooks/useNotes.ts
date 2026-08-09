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
  updateNotePosition,
  updateNoteType,
} from '../api/notes.api';
import { tidyLayout } from '../../ai/services/layout';
import type { StickyNoteData } from '../components/StickyNoteItem';
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
    mutationFn: (note: { content: string; x: number; y: number }) =>
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
 * Re-flows the board into the 4-column grid. Notes keep their current order,
 * so a tidy is predictable rather than a reshuffle.
 */
export function useTidyNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: async (notes: StickyNoteData[]) => {
      const tidied = tidyLayout(notes);
      await bulkMoveNotes(tidied.map(({ id, x, y }) => ({ id, x, y })));
      return tidied;
    },
    // Snap immediately — waiting on a round trip makes the button feel broken.
    onMutate: async (notes) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StickyNoteData[]>(key);
      qc.setQueryData<StickyNoteData[]>(key, tidyLayout(notes));
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
