import type { RealtimePort, RecordingStatusValue } from '../../core/ports';
import { API_BASE_URL, refreshAccessToken } from './client';
import { tokenStore } from './tokenStore';

export const apiRealtime: RealtimePort = {
  watchRecording(
    recordingId: string,
    onChange: (next: { status: RecordingStatusValue; error: string | null }) => void
  ): () => void {
    const controller = new AbortController();

    (async () => {
      let attempt = 0;
      let isTerminal = false;

      while (!controller.signal.aborted && !isTerminal) {
        try {
          const token = tokenStore.getAccessToken();
          const res = await fetch(`${API_BASE_URL}/recordings/${recordingId}/events`, {
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              Accept: 'text/event-stream',
            },
            credentials: 'include',
            signal: controller.signal,
          });

          if (res.status === 401 && !controller.signal.aborted) {
            const refreshed = await refreshAccessToken();
            if (!refreshed) break;
            continue;
          }

          if (res.status === 404) {
            break;
          }

          if (!res.ok || !res.body) {
            throw new Error(`SSE HTTP ${res.status}`);
          }

          attempt = 0;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';

          while (!controller.signal.aborted) {
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
                    if (next.status === 'completed' || next.status === 'failed') {
                      isTerminal = true;
                    }
                  } catch {
                    // Ignore parse errors on malformed frames
                  }
                }
              }
            }
            if (isTerminal) break;
          }
        } catch {
          if (controller.signal.aborted) break;
        }

        if (!controller.signal.aborted && !isTerminal) {
          attempt++;
          const delayMs = Math.min(5000, 200 * 2 ** Math.min(attempt, 4));
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, delayMs);
            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                resolve();
              },
              { once: true }
            );
          });
        }
      }
    })().catch(() => {
      // Connection closed or aborted
    });

    return () => controller.abort();
  },
};
