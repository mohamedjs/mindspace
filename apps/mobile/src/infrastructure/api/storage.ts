import { Platform } from 'react-native';
import { File } from 'expo-file-system';
import type { StoragePort } from '../../core/ports';
import { PipelineError } from '../../core/errors';
import { extensionFor } from '../../features/voice/services/audioFormat';
import { API_BASE_URL, apiFetch } from './client';
import { tokenStore } from './tokenStore';

export const apiStorage: StoragePort = {
  async uploadRecording({ localUri, recordingId }): Promise<string> {
    const blob = Platform.OS === 'web' ? await (await fetch(localUri)).blob() : null;
    const body = blob ?? (await new File(localUri).arrayBuffer());
    const { contentType } = extensionFor(Platform.OS, blob?.type);

    let attempt = 0;
    while (true) {
      try {
        const token = tokenStore.getAccessToken();
        const headers: Record<string, string> = {
          'Content-Type': contentType || 'audio/m4a',
          'X-Client': 'mobile',
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const uploadRes = await fetch(`${API_BASE_URL}/recordings/${recordingId}/parts/0`, {
          method: 'PUT',
          headers,
          body,
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

        // Finish recording on server to start pipeline
        await apiFetch(`/recordings/${recordingId}/finish`, {
          method: 'POST',
          body: JSON.stringify({}),
        });

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
