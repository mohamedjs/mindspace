'use client';
import { useEffect, useState } from 'react';
import type { RecordingStatus } from '../../../core/domain';
import { supabaseContainer } from '../../../infrastructure/container';

export type { RecordingStatus };

/**
 * Live status for one recording, so the UI can move recorded -> transcribing
 * -> completed without polling. The subscription mechanics belong to the
 * realtime adapter; this hook only knows "watch this, tell me when it moves".
 */
export function useRecordingStatus(recordingId: string | null) {
  const [status, setStatus] = useState<RecordingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) {
      setStatus(null);
      setError(null);
      return;
    }

    let cancelled = false;

    // Seed with the current value so we don't wait for the first change event.
    supabaseContainer.recordings.getStatus(recordingId).then((current) => {
      if (!cancelled && current) {
        setStatus(current.status);
        setError(current.error);
      }
    });

    const unsubscribe = supabaseContainer.realtime.watchRecording(recordingId, (next) => {
      setStatus(next.status);
      setError(next.error);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [recordingId]);

  return { status, error };
}
