import type { Space } from '../../../core/domain';
import { container } from '../../../infrastructure/container';

export type { Space };

const spaces = container.spaces;

export const fetchSpaces = () => spaces.list();
export const createSpace = (name: string, emoji?: string) => spaces.create(name, emoji);
export const updateSpace = (spaceId: string, name: string) => spaces.rename(spaceId, name);
export const deleteSpace = (spaceId: string) => spaces.remove(spaceId);
export const fetchMindMap = (spaceId: string) => spaces.getMindMap(spaceId);
