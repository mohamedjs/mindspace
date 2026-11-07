'use client';

import React, { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RecordScreen } from '@/features/voice/components/RecordScreen';
import { uploadRecording } from '@/features/voice/services/upload';
import { finishRecording } from '@/features/voice/api/recordings.api';
import { useAuth } from '@/providers/AuthProvider';
import { toast } from 'sonner';

function RecordPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const spaceId = searchParams.get('spaceId');
  const { user } = useAuth();

  if (!spaceId) {
    router.replace('/');
    return null;
  }

  const handleRecorded = async (recordingId: string, localUri: string) => {
    if (!user) return;
    try {
      // 1. Upload recording
      await uploadRecording({
        localUri,
        userId: user.id,
        spaceId,
        recordingId,
      });

      // 2. Finish recording on server to start pipeline
      await finishRecording(recordingId).catch((err: unknown) => {
        console.error('[RecordPage] finish recording error:', err);
      });

      router.replace(`/?recordingId=${recordingId}`);
    } catch (err: unknown) {
      toast.error('Upload failed', {
        description: err instanceof Error ? err.message : String(err),
      });
      router.replace('/');
    }
  };

  return (
    <RecordScreen
      spaceId={spaceId}
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
