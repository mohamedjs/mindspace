import type { Profile } from '../../../core/domain';
import { supabaseContainer } from '../../../infrastructure/container';

export type { Profile };

export const fetchProfile = () => supabaseContainer.account.getProfile();
export const updateDisplayName = (name: string) =>
  supabaseContainer.account.updateDisplayName(name);
export const deleteOwnAccount = () => supabaseContainer.account.deleteAccount();
