import type { NoteGroup } from '../../core/domain';
import type { CreateGroupInput, GroupPatch, GroupRepository } from '../../core/ports';
import { apiFetch } from './client';
import { toGroup } from './mappers';

export const apiGroupRepository: GroupRepository = {
  async listBySpace(spaceId: string): Promise<NoteGroup[]> {
    const data = await apiFetch<Record<string, unknown>[]>(`/spaces/${spaceId}/groups`);
    return (data ?? []).map(toGroup);
  },

  async create(spaceId: string, group: CreateGroupInput): Promise<NoteGroup> {
    const data = await apiFetch<Record<string, unknown>>(`/spaces/${spaceId}/groups`, {
      method: 'POST',
      body: JSON.stringify({
        title: group.title ?? null,
        x: group.x,
        y: group.y,
        ...(group.width !== undefined ? { width: group.width } : {}),
        ...(group.height !== undefined ? { height: group.height } : {}),
      }),
    });
    return toGroup(data);
  },

  async update(groupId: string, fields: GroupPatch): Promise<void> {
    await apiFetch(`/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
  },

  async remove(groupId: string): Promise<void> {
    await apiFetch(`/groups/${groupId}`, {
      method: 'DELETE',
    });
  },
};
