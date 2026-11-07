import type { NoteGroup } from '../../../core/domain';
import type { CreateGroupInput, GroupPatch } from '../../../core/ports';
import { container } from '../../../infrastructure/container';

export type { NoteGroup };

const groups = container.groups;

export const fetchGroups = (spaceId: string) => groups.listBySpace(spaceId);
export const createGroup = (spaceId: string, group: CreateGroupInput) =>
  groups.create(spaceId, group);
export const updateGroup = (groupId: string, fields: GroupPatch) => groups.update(groupId, fields);
export const deleteGroup = (groupId: string) => groups.remove(groupId);
