import type { Note, NoteType } from '../../core/domain';
import type { CreateNoteInput, NoteMove, NoteRepository } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { apiFetch } from './client';
import { toNote, type NoteRow } from './mappers';

export const apiNoteRepository: NoteRepository = {
  async listBySpace(spaceId: string): Promise<Note[]> {
    const rows = await apiFetch<NoteRow[]>(`/spaces/${spaceId}/notes`);
    return (rows ?? []).map(toNote);
  },

  async findById(noteId: string): Promise<Note | null> {
    try {
      const row = await apiFetch<NoteRow>(`/notes/${noteId}`);
      return row ? toNote(row) : null;
    } catch (err) {
      if (err instanceof PipelineError && err.status === 404) {
        return null;
      }
      return null;
    }
  },

  async create(spaceId: string, note: CreateNoteInput): Promise<Note> {
    const row = await apiFetch<NoteRow>(`/spaces/${spaceId}/notes`, {
      method: 'POST',
      body: JSON.stringify({
        ...(note.title !== undefined ? { title: note.title } : {}),
        content: note.content,
        type: note.type ?? 'idea',
        ...(note.color !== undefined ? { color: note.color } : {}),
        x: note.x,
        y: note.y,
        parent_id: note.parentId ?? null,
      }),
    });
    return toNote(row);
  },

  async updateContent(
    noteId: string,
    fields: { title?: string | null; content: string }
  ): Promise<void> {
    await apiFetch(`/notes/${noteId}/content`, {
      method: 'PATCH',
      body: JSON.stringify({
        title: fields.title ?? null,
        content: fields.content,
      }),
    });
  },

  async updateColor(noteId: string, color: string): Promise<void> {
    await apiFetch(`/notes/${noteId}/color`, {
      method: 'PATCH',
      body: JSON.stringify({ color }),
    });
  },

  async updateType(noteId: string, type: NoteType): Promise<void> {
    await apiFetch(`/notes/${noteId}/type`, {
      method: 'PATCH',
      body: JSON.stringify({ type }),
    });
  },

  async updatePosition(noteId: string, x: number, y: number): Promise<void> {
    await apiFetch(`/notes/${noteId}/position`, {
      method: 'PATCH',
      body: JSON.stringify({ x, y }),
    });
  },

  async moveMany(moves: NoteMove[]): Promise<void> {
    if (!moves.length) return;
    await apiFetch('/notes/move', {
      method: 'POST',
      body: JSON.stringify({ moves }),
    });
  },

  async remove(noteId: string): Promise<void> {
    await apiFetch(`/notes/${noteId}`, {
      method: 'DELETE',
    });
  },

  async updateParent(noteId: string, parentId: string | null): Promise<void> {
    await apiFetch(`/notes/${noteId}/parent`, {
      method: 'PATCH',
      body: JSON.stringify({ parent_id: parentId }),
    });
  },

  async bulkUpdate(ids: string[], patch: { color?: string; type?: NoteType }): Promise<void> {
    if (!ids.length) return;
    await apiFetch('/notes/bulk-update', {
      method: 'POST',
      body: JSON.stringify({
        ids,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.type !== undefined ? { note_type: patch.type } : {}),
      }),
    });
  },

  async bulkDelete(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await apiFetch('/notes/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async bulkRestore(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await apiFetch('/notes/bulk-restore', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async bulkCreate(spaceId: string, notes: CreateNoteInput[]): Promise<Note[]> {
    if (!notes.length) return [];
    const data = await apiFetch<{ notes: NoteRow[] }>('/notes/bulk-create', {
      method: 'POST',
      body: JSON.stringify({
        notes: notes.map((n) => ({
          space_id: spaceId,
          title: n.title ?? null,
          content: n.content,
          type: n.type ?? 'idea',
          color: n.color ?? null,
          x: n.x,
          y: n.y,
          parent_id: n.parentId ?? null,
        })),
      }),
    });
    return (data?.notes ?? []).map(toNote);
  },
};
