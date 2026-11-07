import type { RealtimePort, RecordingStatusValue } from '../../core/ports';
import { API_BASE_URL } from './client';
import { tokenStore } from './tokenStore';

export const apiRealtime: RealtimePort = {
  watchRecording(
    recordingId: string,
    onChange: (next: { status: RecordingStatusValue; error: string | null }) => void
  ): () => void {
    const controller = new AbortController();

    (async () => {
      const token = tokenStore.getAccessToken();
      const res = await fetch(`${API_BASE_URL}/recordings/${recordingId}/events`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept: 'text/event-stream',
        },
        credentials: 'include',
        signal: controller.signal,
      });

      if (!res.ok || !res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);

          const lines = frame.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const next = JSON.parse(line.slice(6));
                onChange({ status: next.status, error: next.error ?? null });
              } catch {
                // Ignore parse errors on malformed frames
              }
            }
          }
        }
      }
    })().catch(() => {
      // Connection closed or aborted
    });

    return () => controller.abort();
  },
};
