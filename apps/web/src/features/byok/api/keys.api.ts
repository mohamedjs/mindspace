import type { UserKey } from '../../../core/domain';
import type { SaveKeyInput } from '../../../core/ports';
import { container } from '../../../infrastructure/container';

export type { UserKey };

export const fetchUserKeys = () => container.keys.list();
export const saveUserKey = (args: SaveKeyInput) => container.keys.save(args);
export const deleteUserKey = (keyId: string) => container.keys.remove(keyId);

