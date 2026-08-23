'use client';

import React from 'react';
import type { Note as StickyNoteData } from '@/core/domain';
import type { NoteTree } from '../hooks/useNoteTree';
import { NoteListRow } from './NoteListRow';

interface ListPaneProps {
  tree: NoteTree;
  onPressNote?: (noteId: string) => void;
}

export const ListPane: React.FC<ListPaneProps> = ({ tree, onPressNote }) => {
  if (tree.roots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="text-base font-bold text-ink mb-1">No notes in this space yet</div>
        <div className="text-xs text-muted max-w-sm">Tap the microphone below to record a voice note or add one manually.</div>
      </div>
    );
  }

  return (
    <div className="w-full pb-24 space-y-3">
      {tree.roots.map((item: StickyNoteData) => (
        <NoteListRow key={item.id} note={item} childrenOf={tree.childrenOf} onPress={onPressNote} />
      ))}
    </div>
  );
};
