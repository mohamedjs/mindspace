import type { UserKey } from '../../../core/domain';
import type { SaveKeyInput } from '../../../core/ports';
import { supabaseContainer } from '../../../infrastructure/container';

export type { UserKey };

export const fetchUserKeys = () => supabaseContainer.keys.list();
export const saveUserKey = (args: SaveKeyInput) => supabaseContainer.keys.save(args);
export const deleteUserKey = (keyId: string) => supabaseContainer.keys.remove(keyId);
