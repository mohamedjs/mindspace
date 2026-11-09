import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { StoragePort } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { extensionFor } from '../../features/voice/services/audioFormat';
import { API_BASE_URL, refreshAccessToken } from './client';
import { tokenStore } from './tokenStore';

export const apiStorage: StoragePort = {
  async uploadRecording({ localUri, recordingId }): Promise<string> {
    const blob = Platform.OS === 'web' ? await (await fetch(localUri)).blob() : null;
    try {
      const body = blob ?? (await new File(localUri).arrayBuffer());
      const { contentType } = extensionFor(Platform.OS, blob?.type);

      let attempt = 0;
      while (true) {
        try {
          await tokenStore.init();
          let token = tokenStore.getAccessToken();
          if (!token && tokenStore.getRefreshToken()) {
            token = await refreshAccessToken();
          }

          const makeHeaders = (t: string | null): Record<string, string> => {
            const h: Record<string, string> = {
              'Content-Type': contentType || 'audio/m4a',
              'X-Client': 'mobile',
            };
            if (t) {
              h['Authorization'] = `Bearer ${t}`;
            }
            return h;
          };

          let uploadRes = await fetch(`${API_BASE_URL}/recordings/${recordingId}/parts/0`, {
            method: 'PUT',
            headers: makeHeaders(token),
            body,
          });

          if (uploadRes.status === 401) {
            const newToken = await refreshAccessToken();
            if (newToken) {
              uploadRes = await fetch(`${API_BASE_URL}/recordings/${recordingId}/parts/0`, {
                method: 'PUT',
                headers: makeHeaders(newToken),
                body,
              });
            }
          }

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
    } finally {
      if (Platform.OS === 'web' && localUri.startsWith('blob:')) {
        try {
          URL.revokeObjectURL(localUri);
        } catch {
          // Ignore URL revoke errors
        }
      }
    }
  },

  async signedUrl(storagePath: string): Promise<string> {
    return `${API_BASE_URL}/recordings/${storagePath}`;
  },
};
