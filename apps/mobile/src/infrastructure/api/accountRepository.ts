import type { Profile } from '../../core/domain';
import type { AccountRepository } from '../../core/ports';
import { apiFetch } from './client';

export const apiAccountRepository: AccountRepository = {
  async getProfile(): Promise<Profile> {
    const data = await apiFetch<{ display_name: string | null; email: string }>('/account/profile');
    return {
      displayName: data.display_name,
      email: data.email,
    };
  },

  async updateDisplayName(name: string): Promise<void> {
    await apiFetch('/account/profile', {
      method: 'PATCH',
      body: JSON.stringify({ display_name: name.trim() }),
    });
  },

  async deleteAccount(): Promise<void> {
    await apiFetch('/account', {
      method: 'DELETE',
    });
  },
};
