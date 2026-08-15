import type { NoteGroup } from '../../../core/domain';
import type { CreateGroupInput, GroupPatch } from '../../../core/ports';
import { supabaseContainer } from '../../../infrastructure/container';

export type { NoteGroup };

const groups = supabaseContainer.groups;

export const fetchGroups = (spaceId: string) => groups.listBySpace(spaceId);
export const createGroup = (spaceId: string, group: CreateGroupInput) =>
  groups.create(spaceId, group);
export const updateGroup = (groupId: string, fields: GroupPatch) => groups.update(groupId, fields);
export const deleteGroup = (groupId: string) => groups.remove(groupId);
