import { useMemo } from 'react';
import type { StickyNoteData } from '../../sticky-notes/components/StickyNoteItem';

export interface NoteTree {
  /** parentId -> its sub-notes, for rendering nesting. */
  childrenOf: Map<string, StickyNoteData[]>;
  /** Top-level notes, newest first. */
  roots: StickyNoteData[];
}

/**
 * Turns the flat notes array into the parent/child shape both panes render
 * from. Kept in one place so the list and the calendar can never disagree
 * about what counts as a root or which notes hang off which parent.
 */
export function useNoteTree(notes: StickyNoteData[] | undefined): NoteTree {
  return useMemo(() => {
    const childrenOf = new Map<string, StickyNoteData[]>();
    notes?.forEach((note) => {
      if (!note.parentId) return;
      childrenOf.set(note.parentId, [...(childrenOf.get(note.parentId) ?? []), note]);
    });

    // Newest first: what you just said should be at the top, not buried under
    // months of older thinking.
    const roots = (notes ?? [])
      .filter((note) => !note.parentId)
      .sort((a, b) => ((a.createdAt ?? '') < (b.createdAt ?? '') ? 1 : -1));

    return { childrenOf, roots };
  }, [notes]);
}
