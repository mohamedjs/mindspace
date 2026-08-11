import React from 'react';
import { FlatList } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import type { Note as StickyNoteData } from '../../../core/domain';
import type { NoteTree } from '../hooks/useNoteTree';
import { NoteListRow } from './NoteListRow';

interface ListPaneProps {
  tree: NoteTree;
  onPressNote?: (noteId: string) => void;
}

/** Every note, newest first, with sub-notes nested under their parent. */
export const ListPane: React.FC<ListPaneProps> = ({ tree, onPressNote }) => (
  <FlatList
    data={tree.roots}
    keyExtractor={(item: StickyNoteData) => item.id}
    contentContainerStyle={{ padding: 12, paddingBottom: 140 }}
    renderItem={({ item }) => (
      <NoteListRow note={item} childrenOf={tree.childrenOf} onPress={onPressNote} />
    )}
    ListEmptyComponent={
      <Text className="px-4 py-16 text-center text-sm text-muted">
        No notes yet. Tap the mic and start thinking out loud.
      </Text>
    }
  />
);
