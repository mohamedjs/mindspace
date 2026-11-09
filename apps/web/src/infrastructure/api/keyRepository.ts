import type { UserKey } from '../../core/domain';
import type { KeyRepository, SaveKeyInput } from '../../core/ports';
import { apiFetch } from './client';
import { toUserKey } from './mappers';

export const apiKeyRepository: KeyRepository = {
  async list(): Promise<UserKey[]> {
    const data = await apiFetch<Record<string, unknown>[]>('/keys');
    return (data ?? []).map(toUserKey);
  },

  async save(input: SaveKeyInput): Promise<{ ok: true; keyHint: string }> {
    return apiFetch<{ ok: true; keyHint: string }>('/keys', {
      method: 'POST',
      body: JSON.stringify({
        provider: input.provider,
        apiKey: input.apiKey,
        label: input.label,
      }),
    });
  },

  async remove(keyId: string): Promise<void> {
    await apiFetch(`/keys/${keyId}`, {
      method: 'DELETE',
    });
  },
};
