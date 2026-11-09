import { CANVAS_TOOLS } from '@mindspace/contracts';

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

/**
 * Build normalized chord -> tool id lookup from CANVAS_TOOLS.
 * Later zones (e.g. 'selection' for 'G') override earlier ones so 'G' resolves
 * to 'sel_group' (which CanvasRoot routes to group-selection or add-group).
 */
const CHORD_MAP = new Map<string, ShortcutAction>();
for (const tool of CANVAS_TOOLS) {
  if (!tool.key) continue;
  CHORD_MAP.set(tool.key.toLowerCase(), tool.id as ShortcutAction);
}

export function resolveShortcut(e: ShortcutEventLike): ShortcutAction | null {
  // Never steal keys from anywhere the user can type.
  if (e.isContentEditable) return null;
  if (TYPING_TAGS.includes((e.targetTag ?? '').toUpperCase())) return null;

  const mod = Boolean(e.ctrlKey || e.metaKey);
  if (e.altKey) return null;

  const keyLower = e.key.toLowerCase();

  if (mod) {
    const chord = `${e.shiftKey ? 'ctrl+shift+' : 'ctrl+'}${keyLower}`;
    return CHORD_MAP.get(chord) ?? null;
  }

  // Escape & Delete aliases
  if (e.key === 'Escape' || e.key === 'Esc') {
    return CHORD_MAP.get('esc') ?? 'sel_clear';
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    return CHORD_MAP.get('delete') ?? 'sel_delete';
  }

  // Zoom '+' alias for '='
  if (e.key === '+' || e.key === '=') {
    return CHORD_MAP.get('+') ?? 'view_zoom_in';
  }

  if (e.shiftKey) {
    return CHORD_MAP.get(`shift+${keyLower}`) ?? null;
  }

  return CHORD_MAP.get(keyLower) ?? null;
}
