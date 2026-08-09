import { supabase } from '../../../lib/supabase/client';

export interface Profile {
  displayName: string | null;
  email: string | null;
}

export async function fetchProfile(): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not_signed_in');

  const { data, error } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', auth.user.id)
    .single();

  if (error) throw error;
  return { displayName: data.display_name, email: auth.user.email ?? null };
}

export async function updateDisplayName(name: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('not_signed_in');

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name.trim() })
    .eq('id', auth.user.id);

  if (error) throw error;
}

/** Deletes every space/note/recording/key the user owns, then the auth account itself. */
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
}
