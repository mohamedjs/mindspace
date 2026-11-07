import type { Profile } from '../../../core/domain';
import { container } from '../../../infrastructure/container';

export type { Profile };

export const fetchProfile = () => container.account.getProfile();
export const updateDisplayName = (name: string) =>
  container.account.updateDisplayName(name);
export const deleteOwnAccount = () => container.account.deleteAccount();

