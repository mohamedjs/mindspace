import type { Note as StickyNoteData, NoteType } from '../../../core/domain';
import type { CreateNoteInput, NoteMove } from '../../../core/ports';
import { container } from '../../../infrastructure/container';

/**
 * Thin delegation to the notes repository.
 *
 * Kept as a module so the existing hooks keep their import surface, but it now
 * holds no SQL, no column names, and no knowledge of Postgres — all of that
 * lives behind NoteRepository. New code should prefer `useRepositories().notes`
 * so the dependency is injectable; these functions exist for the call sites
 * that already import them.
 */
const notes = container.notes;

export const fetchNotes = (spaceId: string): Promise<StickyNoteData[]> => notes.listBySpace(spaceId);
export const fetchNote = (noteId: string) => notes.findById(noteId);
export const createNote = (spaceId: string, note: CreateNoteInput) => notes.create(spaceId, note);
export const updateNoteColor = (noteId: string, color: string) => notes.updateColor(noteId, color);
export const updateNoteType = (noteId: string, type: NoteType) => notes.updateType(noteId, type);
export const updateNotePosition = (noteId: string, x: number, y: number) =>
  notes.updatePosition(noteId, x, y);
export const updateNoteContent = (
  noteId: string,
  fields: { title?: string | null; content: string }
) => notes.updateContent(noteId, fields);
export const deleteNote = (noteId: string) => notes.remove(noteId);
export const bulkMoveNotes = (moves: NoteMove[]) => notes.moveMany(moves);
/** Re-parent a note, or detach it with null. Callers must reject cycles first. */
export const updateNoteParent = (noteId: string, parentId: string | null) =>
  notes.updateParent(noteId, parentId);
