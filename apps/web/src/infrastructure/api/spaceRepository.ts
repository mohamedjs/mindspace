import type { Space } from '../../core/domain';
import type { SpaceRepository, MindMapData } from '../../core/ports';
import { apiFetch } from './client';
import { toSpace, toNote } from './mappers';

export const apiSpaceRepository: SpaceRepository = {
  async list(): Promise<Space[]> {
    const data = await apiFetch<Record<string, unknown>[]>('/spaces');
    return (data ?? []).map(toSpace);
  },

  async create(name: string, emoji = '💡'): Promise<Space> {
    const data = await apiFetch<Record<string, unknown>>('/spaces', {
      method: 'POST',
      body: JSON.stringify({ name, emoji }),
    });
    return toSpace(data);
  },

  async rename(spaceId: string, name: string): Promise<void> {
    await apiFetch(`/spaces/${spaceId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: name.trim() }),
    });
  },

  async remove(spaceId: string): Promise<void> {
    await apiFetch(`/spaces/${spaceId}`, {
      method: 'DELETE',
    });
  },

  async getMindMap(spaceId: string): Promise<MindMapData> {
    const data = await apiFetch<{
      nodes: Record<string, unknown>[];
      edges: Array<{ id?: string; from?: string; to?: string; from_note_id?: string; to_note_id?: string; type?: string }>;
    }>(`/spaces/${spaceId}/mind-map`);
    return {
      nodes: (data?.nodes ?? []).map(toNote),
      edges: (data?.edges ?? []).map((e) => ({
        id: e.id ?? `${e.from ?? e.from_note_id}-${e.to ?? e.to_note_id}`,
        from: (e.from ?? e.from_note_id)!,
        to: (e.to ?? e.to_note_id)!,
        type: e.type ?? 'parent',
      })),
    };
  },
};
