import React, { useCallback } from 'react';
import Toast from 'react-native-toast-message';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { RecordScreen } from '../features/voice/components/RecordScreen';
import { uploadRecording } from '../features/voice/services/upload';
import { markRecordingFailed } from '../features/voice/services/recorder';
import { runThinkingPipeline } from '../features/voice/services/pipeline';
import { PipelineError, describeFailure } from '../features/voice/services/pipelineErrors';
import { queryKeys } from '../lib/query-client/keys';
import { useAuth } from '../providers/AuthProvider';
import { useEntitlements } from '../features/billing/hooks/useEntitlements';

export default function RecordRoute() {
  const router = useRouter();
  const qc = useQueryClient();
  const { spaceId, parentNoteId, fillNoteId } = useLocalSearchParams<{
    spaceId: string;
    /** Speak about a note: the result lands as sub-notes under it. */
    parentNoteId?: string;
    /** Speak into a note: the result becomes that note's own text. */
    fillNoteId?: string;
  }>();
  const { user } = useAuth();
  const { aiEnabled, isLoading: planLoading } = useEntitlements();
  const targetNoteId = parentNoteId ?? fillNoteId;

  const handleRecorded = useCallback(
    async (recordingId: string, localUri: string) => {
      if (!user || !spaceId) return;

      // Leave the recording screen immediately — the rest runs in the
      // background. useRecordingStatus (subscribed on whichever screen we land
      // on) drives the recorded -> transcribing -> transcribed UI meanwhile.
      // Recording from inside a note goes back to that note, where its new
      // sub-notes will appear, rather than out to the canvas.
      if (targetNoteId) {
        router.replace({
          pathname: '/note/[id]',
          params: { id: targetNoteId, spaceId, recordingId },
        });
      } else {
        router.replace({ pathname: '/', params: { spaceId, recordingId } });
      }

      try {
        await uploadRecording({ localUri, userId: user.id, spaceId, recordingId });
        await runThinkingPipeline(recordingId, spaceId, parentNoteId, fillNoteId);
        // Extraction inserted notes directly in the DB — pull them in.
        qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId) });
        qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
      } catch (err) {
        // Store "code: message" so whichever screen reads recordings.error
        // back can still tell out-of-credits from a provider timeout.
        const code = err instanceof PipelineError ? err.code : 'unknown';
        const message = err instanceof Error ? err.message : String(err);
        await markRecordingFailed(recordingId, `${code}: ${message}`).catch(() => {});

        const copy = describeFailure(err);
        Toast.show({ type: 'error', text1: copy.title, text2: copy.message });
      }
    },
    [user, spaceId, parentNoteId, fillNoteId, targetNoteId, router, qc]
  );

  if (!spaceId || planLoading) {
    return null;
  }

  // Every microphone is already hidden on a plan without AI, but the route is
  // still reachable by deep link or an entry left on the back stack. Guarding
  // here as well is what makes "Free has no recording" true rather than merely
  // invisible — and it fails closed, so a plan that has not loaded yet cannot
  // start a recording either.
  if (!aiEnabled) {
    return <Redirect href="/plans" />;
  }

  return (
    <RecordScreen
      spaceId={spaceId}
      parentNoteId={parentNoteId}
      fillNoteId={fillNoteId}
      onRecorded={handleRecorded}
      onCancel={() => router.back()}
    />
  );
}
