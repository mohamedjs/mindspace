import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase/client';

export type RecordingStatus =
  | 'recorded'
  | 'uploading'
  | 'transcribing'
  | 'transcribed'
  | 'extracting'
  | 'completed'
  | 'failed';

/**
 * Subscribes to postgres_changes on a single recordings row so the UI can move
 * recorded -> transcribing -> transcribed without polling.
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
    supabase
      .from('recordings')
      .select('status, error')
      .eq('id', recordingId)
      .single()
      .then(({ data }) => {
        if (!cancelled && data) {
          setStatus(data.status as RecordingStatus);
          setError(data.error ?? null);
        }
      });

    const channel = supabase
      .channel(`recording:${recordingId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recordings',
          filter: `id=eq.${recordingId}`,
        },
        (payload) => {
          const next = payload.new as { status: RecordingStatus; error: string | null };
          setStatus(next.status);
          setError(next.error ?? null);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [recordingId]);

  return { status, error };
}
