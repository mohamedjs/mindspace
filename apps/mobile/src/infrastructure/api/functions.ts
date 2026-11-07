import type { FunctionsPort } from '../../core/ports';
import { apiFetch } from './client';

export const apiFunctions: FunctionsPort = {
  async invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
    return apiFetch<T>(`/functions/${name}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
