'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RecordScreen } from '@/features/voice/components/RecordScreen';
import { uploadRecording } from '@/features/voice/services/upload';
import { finishRecording, markRecordingFailed } from '@/features/voice/api/recordings.api';
import { describeFailure } from '@/features/voice/services/pipelineErrors';
import { useEntitlements } from '@/features/billing/hooks/useEntitlements';
import { queryKeys } from '@/lib/query-client/keys';
import { useAuth } from '@/providers/AuthProvider';
import { toast } from 'sonner';

function RecordPageContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const spaceId = searchParams.get('spaceId');
  const parentNoteId = searchParams.get('parentNoteId') ?? undefined;
  const fillNoteId = searchParams.get('fillNoteId') ?? undefined;
  const targetNoteId = parentNoteId || fillNoteId;
  const { user } = useAuth();
  const { aiEnabled, isLoading: entitlementsLoading } = useEntitlements();

  useEffect(() => {
    if (!spaceId) {
      router.replace('/');
    } else if (!entitlementsLoading && !aiEnabled) {
      router.replace('/plans');
    }
  }, [spaceId, entitlementsLoading, aiEnabled, router]);

  if (!spaceId || entitlementsLoading || !aiEnabled) {
    return null;
  }

  const handleRecorded = async (recordingId: string, localUri: string) => {
    if (!user) return;
    try {
      await uploadRecording({
        localUri,
        userId: user.id,
        spaceId,
        recordingId,
      });

      await finishRecording(recordingId);
    } catch (err: unknown) {
      await markRecordingFailed(
        recordingId,
        err instanceof Error ? err.message : String(err)
      ).catch(() => {});
      const copy = describeFailure(err);
      toast.error(copy.title, {
        description: copy.message,
      });
    } finally {
      qc.invalidateQueries({ queryKey: queryKeys.notes.bySpace(spaceId) });
      qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
      if (targetNoteId) {
        router.replace(`/note/${targetNoteId}?spaceId=${spaceId}&recordingId=${recordingId}`);
      } else {
        router.replace(`/?recordingId=${recordingId}`);
      }
    }
  };

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

export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecordPageContent />
    </Suspense>
  );
}
