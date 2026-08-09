import { supabase } from '../../../lib/supabase/client';
import type { RecordingStatus } from '../hooks/useRecordingStatus';

export interface RecordingNote {
  id: string;
  title: string | null;
  content: string;
  type: string;
  color: string | null;
}

export interface SpaceRecording {
  id: string;
  status: RecordingStatus;
  error: string | null;
  durationMs: number;
  createdAt: string;
  /**
   * Null once the audio has been removed server-side. The transcribe function
   * deletes it after a successful transcription on the free plan, so most
   * recordings are text-only and cannot be replayed.
   */
  storagePath: string | null;
  transcript: string | null;
  notes: RecordingNote[];
}

/**
 * Every recording that fed this space, newest first, with the transcript and
 * the notes it produced. sticky_notes.recording_id is the provenance link the
 * extraction writes, so a note can always be traced back to what was said.
 */
export async function fetchSpaceRecordings(spaceId: string): Promise<SpaceRecording[]> {
  const { data, error } = await supabase
    .from('recordings')
    .select(
      `id, status, error, duration_ms, created_at, storage_path,
       transcripts ( text ),
       sticky_notes ( id, title, content, type, color, deleted_at )`
    )
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  type Row = {
    id: string;
    status: string;
    error: string | null;
    duration_ms: number;
    created_at: string;
    storage_path: string | null;
    transcripts: { text: string }[] | null;
    sticky_notes: (RecordingNote & { deleted_at: string | null })[] | null;
  };

  return (data ?? []).map((raw) => {
    const row = raw as unknown as Row;
    return {
      id: row.id,
      status: row.status as RecordingStatus,
      error: row.error,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
      storagePath: row.storage_path,
      transcript: row.transcripts?.[0]?.text ?? null,
      // Deleted notes stay in the table for undo — don't resurrect them here.
      notes: (row.sticky_notes ?? [])
        .filter((n) => !n.deleted_at)
        .map(({ id, title, content, type, color }) => ({ id, title, content, type, color })),
    };
  });
}

/** Short-lived URL the audio player can stream from. Storage RLS scopes it to the owner. */
export async function signedAudioUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('recordings')
    .createSignedUrl(storagePath, 3600);

  if (error || !data) throw error ?? new Error('signed_url_failed');
  return data.signedUrl;
}
