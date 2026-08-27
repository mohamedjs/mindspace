/**
 * Keyboard shortcut resolution for the canvas toolbar.
 *
 * Pure: takes the interesting bits of a KeyboardEvent, returns an action name
 * (or null). CanvasRoot's single global keydown handler switches on the result,
 * so what is tested here is what ships.
 *
 * Note: `0` (reset zoom), `+`/`-` (zoom) and Escape/Delete are handled directly
 * in CanvasRoot and deliberately not resolved here.
 */

export type ShortcutAction =
  | 'pan'
  | 'pointer'
  | 'write'
  | 'arrow'
  | 'addNote'
  | 'addGroup'
  | 'tidy'
  | 'fitToView'
  | 'recordings'
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

const DIGIT_ACTIONS: Record<string, ShortcutAction> = {
  '1': 'pan',
  '2': 'pointer',
  '3': 'write',
  '4': 'arrow',
  '5': 'addNote',
  '6': 'addGroup',
  '7': 'tidy',
  '8': 'fitToView',
  '9': 'recordings',
};

const TYPING_TAGS = ['INPUT', 'TEXTAREA'];

export function resolveShortcut(e: ShortcutEventLike): ShortcutAction | null {
  // Never steal keys from anywhere the user can type.
  if (e.isContentEditable) return null;
  if (TYPING_TAGS.includes((e.targetTag ?? '').toUpperCase())) return null;

  const mod = Boolean(e.ctrlKey || e.metaKey);

  // Undo/redo are the deliberate modifier exception.
  if (mod && !e.altKey && e.key.toLowerCase() === 'z') {
    return e.shiftKey ? 'redo' : 'undo';
  }

  // Ctrl+1 is a browser tab switch, Alt+n is a menu — not a tool.
  if (mod || e.altKey) return null;

  const digit = DIGIT_ACTIONS[e.key];
  if (digit) return digit;
  if (e.key.toLowerCase() === 'h') return 'toggleChildNotes';

  return null;
}
