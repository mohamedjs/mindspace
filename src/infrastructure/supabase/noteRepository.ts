import type { Note, NoteType } from '../../core/domain';
import type { CreateNoteInput, NoteMove, NoteRepository } from '../../core/ports';
import { supabase } from './client';
import { NOTE_COLUMNS, toNote, type NoteRow } from './mappers';

/** Postgres-backed notes, via PostgREST. */
export const supabaseNoteRepository: NoteRepository = {
  async listBySpace(spaceId: string): Promise<Note[]> {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select(NOTE_COLUMNS)
      .eq('space_id', spaceId)
      .is('deleted_at', null);

    if (error) throw error;
    return (data ?? []).map((row) => toNote(row as unknown as NoteRow));
  },

  async findById(noteId: string): Promise<Note | null> {
    const { data, error } = await supabase
      .from('sticky_notes')
      .select(NOTE_COLUMNS)
      .eq('id', noteId)
      .is('deleted_at', null)
      .single();

    if (error) return null;
    return toNote(data as unknown as NoteRow);
  },

  async create(spaceId: string, note: CreateNoteInput): Promise<Note> {
    const { data, error } = await supabase
      .from('sticky_notes')
      .insert({
        space_id: spaceId,
        content: note.content,
        type: note.type ?? 'idea',
        x: note.x,
        y: note.y,
        parent_id: note.parentId ?? null,
        source_type: 'manual',
      })
      .select(NOTE_COLUMNS)
      .single();

    if (error) throw error;
    return toNote(data as unknown as NoteRow);
  },

  async updateContent(noteId, fields): Promise<void> {
    const { error } = await supabase
      .from('sticky_notes')
      .update({ title: fields.title ?? null, content: fields.content })
      .eq('id', noteId);
    if (error) throw error;
  },

  async updateColor(noteId: string, color: string): Promise<void> {
    const { error } = await supabase.from('sticky_notes').update({ color }).eq('id', noteId);
    if (error) throw error;
  },

  async updateType(noteId: string, type: NoteType): Promise<void> {
    const { error } = await supabase.from('sticky_notes').update({ type }).eq('id', noteId);
    if (error) throw error;
  },

  /**
   * Position only. A DB trigger deliberately skips timeline events for x/y
   * changes, so dragging doesn't flood the activity feed.
   */
  async updatePosition(noteId: string, x: number, y: number): Promise<void> {
    const { error } = await supabase.from('sticky_notes').update({ x, y }).eq('id', noteId);
    if (error) throw error;
  },

  async moveMany(moves: NoteMove[]): Promise<void> {
    if (!moves.length) return;
    const { error } = await supabase.rpc('bulk_move_notes', { p_moves: moves });
    if (error) throw error;
  },

  /** Soft delete — the row stays for undo and provenance. */
  async remove(noteId: string): Promise<void> {
    const { error } = await supabase
      .from('sticky_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId);
    if (error) throw error;
  },
};
