import type { FunctionsPort } from '../../core/ports';
import { apiFetch } from './client';

export const apiFunctions: FunctionsPort = {
  async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    let endpoint = `/ai/${name}`;
    if (name === 'ai-extract') endpoint = '/ai/extract';
    else if (name === 'ai-note-write') endpoint = '/ai/note-write';
    else if (name === 'transcribe') endpoint = '/ai/transcribe';

    return apiFetch<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
