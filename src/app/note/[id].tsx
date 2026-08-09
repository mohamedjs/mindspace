import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NoteEditor } from '../../features/sticky-notes/components/NoteEditor';

export default function NoteEditorScreen() {
  const router = useRouter();
  const { id, spaceId } = useLocalSearchParams<{ id: string; spaceId?: string }>();

  if (!id) return null;

  return (
    <NoteEditor
      noteId={id}
      spaceId={spaceId}
      onBack={() => router.back()}
    />
  );
}
