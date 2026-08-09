import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { NoteEditor } from '../../features/sticky-notes/components/NoteEditor';

export default function NoteEditorScreen() {
  const router = useRouter();
  // recordingId comes back from /record when the user spoke into this note —
  // the editor watches it to show extraction progress in the sub-notes list.
  const { id, spaceId, recordingId } = useLocalSearchParams<{
    id: string;
    spaceId?: string;
    recordingId?: string;
  }>();

  if (!id) return null;

  return (
    <NoteEditor
      noteId={id}
      spaceId={spaceId}
      recordingId={recordingId}
      onBack={() => router.back()}
    />
  );
}
