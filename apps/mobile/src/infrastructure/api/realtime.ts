import type { RealtimePort, RecordingStatusValue } from '../../core/ports';
import { apiFetch } from './client';

export const apiRealtime: RealtimePort = {
  watchRecording(
    recordingId: string,
    onChange: (next: { status: RecordingStatusValue; error: string | null }) => void
  ): () => void {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastStatus: RecordingStatusValue | null = null;
    let lastError: string | null = null;

    const poll = async () => {
      if (cancelled) return;
      try {
        const data = await apiFetch<{ status: RecordingStatusValue; error: string | null }>(
          `/recordings/${recordingId}/status`
        );
        if (cancelled) return;
        if (data) {
          const normError = data.error ?? null;
          if (data.status !== lastStatus || normError !== lastError) {
            lastStatus = data.status;
            lastError = normError;
            onChange({ status: data.status, error: normError });
          }
          if (data.status === 'completed' || data.status === 'failed') {
            return;
          }
        }
      } catch {
        // Ignore transient polling network errors
      }
      if (!cancelled) {
        timer = setTimeout(poll, 2000);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  },
};
