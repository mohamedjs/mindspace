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

export function useNote(noteId: string | null) {
  return useQuery({
    queryKey: queryKeys.notes.detail(noteId ?? ''),
    queryFn: () => fetchNote(noteId!),
    enabled: Boolean(noteId),
  });
}

export function useUpdateNoteColor(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, color }: { noteId: string; color: string }) =>
      updateNoteColor(noteId, color),

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
    mutationFn: (note: { content: string; x: number; y: number; parentId?: string | null }) =>
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

export function useTidyNotes(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: async (notes: StickyNoteData[]) => {
      const moves = tidyLayout(notes);
      if (!moves.length) return [];
      await bulkMoveNotes(moves);
      return moves;
    },
    onMutate: async (notes) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);

      const moves = tidyLayout(notes);
      const moveMap = new Map(moves.map((m) => [m.id, m]));

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => {
          const move = moveMap.get(note.id);
          return move ? { ...note, x: move.x, y: move.y } : note;
        })
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useMoveCluster(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: (moves: { id: string; x: number; y: number }[]) => bulkMoveNotes(moves),
    onMutate: async (moves) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);

      const moveMap = new Map(moves.map((m) => [m.id, m]));
      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((note) => {
          const move = moveMap.get(note.id);
          return move ? { ...note, x: move.x, y: move.y } : note;
        })
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useSetNoteParent(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, parentId }: { noteId: string; parentId: string | null }) =>
      updateNoteParent(noteId, parentId),
    onMutate: async ({ noteId, parentId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((n) => (n.id === noteId ? { ...n, parentId } : n))
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useUpdateNoteContent(spaceId: string | null) {
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
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((n) =>
          n.id === noteId ? { ...n, title: title !== undefined ? title : n.title, content } : n
        )
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}

export function useUpdateNoteType(spaceId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notes.bySpace(spaceId ?? '');

  return useMutation({
    mutationFn: ({ noteId, type }: { noteId: string; type: NoteType }) =>
      updateNoteType(noteId, type),
    onMutate: async ({ noteId, type }) => {
      await qc.cancelQueries({ queryKey: key });
      const previousNotes = qc.getQueryData<StickyNoteData[]>(key);

      qc.setQueryData<StickyNoteData[]>(key, (old) =>
        (old ?? []).map((n) => (n.id === noteId ? { ...n, type } : n))
      );

      return { previousNotes };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousNotes) qc.setQueryData(key, context.previousNotes);
    },
  });
}
