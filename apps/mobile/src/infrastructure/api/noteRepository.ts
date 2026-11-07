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
        content: note.content,
        type: note.type ?? 'idea',
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
    await apiFetch(`/notes/${noteId}`, {
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
};
