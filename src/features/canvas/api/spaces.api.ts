import { supabase } from '../../../lib/supabase/client';

export interface Space {
  id: string;
  name: string;
  emoji: string;
  noteCount: number;
  lastActivityAt: string;
}

export async function fetchSpaces(): Promise<Space[]> {
  const { data, error } = await supabase
    .from('spaces')
    .select('id, name, emoji, note_count, last_activity_at')
    .is('deleted_at', null)
    .order('last_activity_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    noteCount: row.note_count,
    lastActivityAt: row.last_activity_at,
  }));
}

export async function createSpace(name: string, emoji = '💡'): Promise<Space> {
  const { data, error } = await supabase
    .from('spaces')
    .insert({ name, emoji })
    .select('id, name, emoji, note_count, last_activity_at')
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    emoji: data.emoji,
    noteCount: data.note_count,
    lastActivityAt: data.last_activity_at,
  };
}

/** Soft delete so notes and provenance survive. */
export async function deleteSpace(spaceId: string): Promise<void> {
  const { error } = await supabase
    .from('spaces')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', spaceId);

  if (error) throw error;
}

export async function updateSpace(spaceId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('spaces')
    .update({ name: name.trim() })
    .eq('id', spaceId);

  if (error) throw error;
}
