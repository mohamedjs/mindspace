import React, { useCallback } from 'react';
import Toast from 'react-native-toast-message';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { RecordScreen } from '../features/voice/components/RecordScreen';
import { uploadRecording } from '../features/voice/services/upload';
import { markRecordingFailed } from '../features/voice/services/recorder';
import { runThinkingPipeline } from '../features/voice/services/pipeline';
import { queryKeys } from '../lib/query-client/keys';
import { useAuth } from '../providers/AuthProvider';

export default function RecordRoute() {
  const router = useRouter();
  const qc = useQueryClient();
  const { spaceId, parentNoteId } = useLocalSearchParams<{
    spaceId: string;
    parentNoteId?: string;
  }>();
  const { user } = useAuth();

  const handleRecorded = useCallback(
    async (recordingId: string, localUri: string) => {
      if (!user || !spaceId) return;

      // Leave the recording screen immediately — the rest runs in the
      // background. useRecordingStatus (subscribed on whichever screen we land
      // on) drives the recorded -> transcribing -> transcribed UI meanwhile.
      // Recording from inside a note goes back to that note, where its new
      // sub-notes will appear, rather than out to the canvas.
      if (parentNoteId) {
        router.replace({
          pathname: '/note/[id]',
          params: { id: parentNoteId, spaceId, recordingId },
        });
      } else {
        router.replace({ pathname: '/', params: { spaceId, recordingId } });
      }

      try {
        await uploadRecording({ localUri, userId: user.id, spaceId, recordingId });
        await runThinkingPipeline(recordingId, spaceId, parentNoteId);
        // Extraction inserted notes directly in the DB — pull them in.
        qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId) });
        qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markRecordingFailed(recordingId, message).catch(() => {});
        Toast.show({
          type: 'error',
          text1: 'Could not turn that into notes',
          text2: 'Your audio is saved on this device. We will retry later.',
        });
      }
    },
    [user, spaceId, parentNoteId, router, qc]
  );

  if (!spaceId) {
    return null;
  }

  return (
    <RecordScreen
      spaceId={spaceId}
      onRecorded={handleRecorded}
      onCancel={() => router.back()}
    />
  );
}
