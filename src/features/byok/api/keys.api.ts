import { supabase } from '../../../lib/supabase/client';

export interface UserKey {
  id: string;
  provider: string;
  label: string | null;
  keyHint: string;
  isActive: boolean;
  lastError: string | null;
  createdAt: string;
}

async function edgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.message ?? data.error);
  return data as T;
}

export async function fetchUserKeys(): Promise<UserKey[]> {
  // encrypted_key is revoked from SELECT at the DB level (migration 0005),
  // so selecting * here can never leak it even if this list grows.
  const { data, error } = await supabase
    .from('user_ai_keys')
    .select('id, provider, label, key_hint, is_active, last_error, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label,
    keyHint: row.key_hint,
    isActive: row.is_active,
    lastError: row.last_error,
    createdAt: row.created_at,
  }));
}

export async function saveUserKey(args: {
  provider: string;
  apiKey: string;
  label?: string;
  baseUrl?: string;
}): Promise<{ ok: true; keyHint: string }> {
  return edgeFunction('byok-save', args);
}

export async function deleteUserKey(keyId: string): Promise<void> {
  await edgeFunction('byok-delete', { keyId });
}
