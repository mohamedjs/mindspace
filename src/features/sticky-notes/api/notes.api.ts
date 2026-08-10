import { supabase } from '../../../lib/supabase/client';
import type { StickyNoteData } from '../components/StickyNoteItem';
import type { NoteType } from '../../../shared/constants/tokens';

const NOTE_COLUMNS =
  'id, title, content, type, color, x, y, width, height, parent_id, space_id, due_at, created_at';

interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  type: NoteType;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  parent_id: string | null;
  space_id: string;
  due_at: string | null;
  created_at: string;
}

function toNote(row: NoteRow): StickyNoteData {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    color: row.color,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    parentId: row.parent_id,
    spaceId: row.space_id,
    dueAt: row.due_at,
    createdAt: row.created_at,
  };
}

export async function fetchNotes(spaceId: string): Promise<StickyNoteData[]> {
  const { data, error } = await supabase
    .from('sticky_notes')
    .select(NOTE_COLUMNS)
    .eq('space_id', spaceId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data ?? []).map((row) => toNote(row as NoteRow));
}

export async function createNote(
  spaceId: string,
  note: { content: string; type?: NoteType; x: number; y: number; parentId?: string | null }
): Promise<StickyNoteData> {
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
  return toNote(data as NoteRow);
}

export async function updateNoteColor(noteId: string, color: string): Promise<void> {
  const { error } = await supabase.from('sticky_notes').update({ color }).eq('id', noteId);
  if (error) throw error;
}

/**
 * Position updates only. The DB trigger deliberately skips timeline events for
 * x/y-only changes, so dragging doesn't flood the activity feed.
 */
export async function updateNotePosition(noteId: string, x: number, y: number): Promise<void> {
  const { error } = await supabase.from('sticky_notes').update({ x, y }).eq('id', noteId);
  if (error) throw error;
}

/** Soft delete — the row stays for undo and provenance. */
export async function deleteNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from('sticky_notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId);

  if (error) throw error;
}

/** Fetch a single note by id. */
export async function fetchNote(noteId: string): Promise<StickyNoteData | null> {
  const { data, error } = await supabase
    .from('sticky_notes')
    .select(NOTE_COLUMNS)
    .eq('id', noteId)
    .is('deleted_at', null)
    .single();

  if (error) return null;
  return toNote(data as NoteRow);
}

/** Update a note's title and content. */
export async function updateNoteContent(
  noteId: string,
  fields: { title?: string | null; content: string }
): Promise<void> {
  const { error } = await supabase
    .from('sticky_notes')
    .update({ title: fields.title ?? null, content: fields.content })
    .eq('id', noteId);
  if (error) throw error;
}

/** Update a note's type tag. */
export async function updateNoteType(noteId: string, type: NoteType): Promise<void> {
  const { error } = await supabase
    .from('sticky_notes')
    .update({ type })
    .eq('id', noteId);
  if (error) throw error;
}

/**
 * Repositions many notes in one round trip. Uses the bulk_move_notes RPC so a
 * tidy of 30 notes is a single statement instead of 30 racing updates.
 */
export async function bulkMoveNotes(
  moves: { id: string; x: number; y: number }[]
): Promise<void> {
  if (!moves.length) return;
  const { error } = await supabase.rpc('bulk_move_notes', { p_moves: moves });
  if (error) throw error;
}
