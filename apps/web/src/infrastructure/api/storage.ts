import type { StoragePort } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { API_BASE_URL } from './client';
import { tokenStore } from './tokenStore';

export const apiStorage: StoragePort = {
  async uploadRecording({ localUri, recordingId }): Promise<string> {
    const res = await fetch(localUri);
    const blob = await res.blob();

    let attempt = 0;
    while (true) {
      try {
        const token = tokenStore.getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': blob.type || 'audio/webm',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadRes = await fetch(`${API_BASE_URL}/recordings/${recordingId}/parts/0`, {
          method: 'PUT',
          headers,
          credentials: 'include',
          body: blob,
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => null);
          throw new PipelineError(
            errData?.error ?? 'upload_failed',
            errData?.message ?? `Upload failed with HTTP ${uploadRes.status}`,
            uploadRes.status,
            errData
          );
        }

        return recordingId;
      } catch (err) {
        attempt++;
        if (attempt >= 3) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
      }
    }
  },

  async signedUrl(storagePath: string): Promise<string> {
    return `${API_BASE_URL}/recordings/${storagePath}`;
  },
};
