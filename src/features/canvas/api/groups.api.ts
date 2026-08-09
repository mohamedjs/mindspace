import { supabase } from '../../../lib/supabase/client';

export interface NoteGroup {
  id: string;
  title: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
}

const GROUP_COLUMNS = 'id, title, x, y, width, height, color';

export async function fetchGroups(spaceId: string): Promise<NoteGroup[]> {
  const { data, error } = await supabase
    .from('note_groups')
    .select(GROUP_COLUMNS)
    .eq('space_id', spaceId)
    .is('deleted_at', null);

  if (error) throw error;
  return (data ?? []) as NoteGroup[];
}

export async function createGroup(
  spaceId: string,
  group: { title?: string | null; x: number; y: number; width?: number; height?: number }
): Promise<NoteGroup> {
  const { data, error } = await supabase
    .from('note_groups')
    .insert({
      space_id: spaceId,
      title: group.title ?? null,
      x: group.x,
      y: group.y,
      ...(group.width ? { width: group.width } : {}),
      ...(group.height ? { height: group.height } : {}),
    })
    .select(GROUP_COLUMNS)
    .single();

  if (error) throw error;
  return data as NoteGroup;
}

export async function updateGroup(
  groupId: string,
  fields: Partial<Pick<NoteGroup, 'title' | 'x' | 'y' | 'width' | 'height' | 'color'>>
): Promise<void> {
  const { error } = await supabase.from('note_groups').update(fields).eq('id', groupId);
  if (error) throw error;
}

/** Soft delete, matching sticky_notes — the frame goes, the notes inside stay. */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('note_groups')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', groupId);
  if (error) throw error;
}
