/**
 * Keyboard shortcut resolution for the canvas toolbar.
 * Single source of truth is CANVAS_TOOLS from @mindspace/contracts.
 */

export type ShortcutAction =
  | 'select'
  | 'hand'
  | 'connect'
  | 'write'
  | 'create_voice'
  | 'create_note'
  | 'create_subnote'
  | 'create_group'
  | 'sel_group'
  | 'sel_ungroup'
  | 'sel_link'
  | 'sel_unlink'
  | 'sel_tidy'
  | 'sel_duplicate'
  | 'sel_delete'
  | 'sel_clear'
  | 'view_undo'
  | 'view_redo'
  | 'view_fit'
  | 'view_tidy_all'
  | 'view_subnotes'
  | 'view_zoom_in'
  | 'view_zoom_out'
  | 'view_zoom_reset'
  // Synonyms for backwards compatibility in CanvasRoot
  | 'pointer'
  | 'pan'
  | 'arrow'
  | 'addNote'
  | 'addGroup'
  | 'tidy'
  | 'fitToView'
  | 'toggleChildNotes'
  | 'undo'
  | 'redo';

export interface ShortcutEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** e.target's tagName, e.g. 'INPUT' */
  targetTag?: string;
  /** e.target's isContentEditable — the note editor is a TipTap contenteditable */
  isContentEditable?: boolean;
}

const TYPING_TAGS = ['INPUT', 'TEXTAREA'];

export function resolveShortcut(e: ShortcutEventLike): ShortcutAction | null {
  // Never steal keys from anywhere the user can type.
  if (e.isContentEditable) return null;
  if (TYPING_TAGS.includes((e.targetTag ?? '').toUpperCase())) return null;

  const mod = Boolean(e.ctrlKey || e.metaKey);
  const keyLower = e.key.toLowerCase();

  // Undo & Redo (Ctrl+Z, Ctrl+Shift+Z, Cmd+Z, Cmd+Shift+Z)
  if (mod && !e.altKey && keyLower === 'z') {
    return e.shiftKey ? 'view_redo' : 'view_undo';
  }

  // Duplicate (Ctrl+D, Cmd+D)
  if (mod && !e.altKey && keyLower === 'd') {
    return 'sel_duplicate';
  }

  // Any other modifier combo is not a canvas tool shortcut
  if (mod || e.altKey) return null;

  // Escape & Delete
  if (e.key === 'Escape' || e.key === 'Esc') return 'sel_clear';
  if (e.key === 'Delete' || e.key === 'Backspace') return 'sel_delete';

  // Zoom keys
  if (e.key === '+' || e.key === '=') return 'view_zoom_in';
  if (e.key === '-') return 'view_zoom_out';
  if (e.key === '0') return 'view_zoom_reset';

  // Shift combinations
  if (e.shiftKey) {
    if (keyLower === 'n') return 'create_subnote';
    if (keyLower === 'g') return 'sel_ungroup';
    if (keyLower === 'l') return 'sel_unlink';
    if (keyLower === 't') return 'view_tidy_all';
    return null;
  }

  // Plain letter shortcuts
  switch (keyLower) {
    case 'v':
      return 'select';
    case 'h':
      return 'hand';
    case 'c':
      return 'connect';
    case 'w':
      return 'write';
    case 'r':
      return 'create_voice';
    case 'n':
      return 'create_note';
    case 'g':
      return 'sel_group';
    case 'l':
      return 'sel_link';
    case 't':
      return 'sel_tidy';
    case 'f':
      return 'view_fit';
    case 's':
      return 'view_subnotes';
    default:
      return null;
  }
}
