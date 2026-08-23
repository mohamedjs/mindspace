import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * One Supabase client, bound to the user's own session — never service role.
 * Every table carries `user_id uuid not null default auth.uid()` plus an RLS
 * policy of `auth.uid() = user_id`, so writes here simply omit user_id: the
 * column default fills it from the JWT and there is no code path that could
 * address someone else's row. Reads are filtered by the same policy.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

/** No generated Database types in this repo, so rows come back loosely typed. */
export type Db = SupabaseClient<any, any, any>;

let cached: Db | null = null;

export async function db(): Promise<Db> {
  if (cached) return cached;

  const client = createClient(required('MINDSPACE_SUPABASE_URL'), required('MINDSPACE_SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: true },
  });

  // A bare access token expires in ~1h and this process lives for a whole
  // agent session, so hand the SDK the refresh token too and let it renew.
  const { error } = await client.auth.setSession({
    access_token: required('MINDSPACE_ACCESS_TOKEN'),
    refresh_token: required('MINDSPACE_REFRESH_TOKEN'),
  });
  if (error) throw new Error(`sign-in failed: ${error.message}`);

  cached = client;
  return client;
}

/** PostgREST errors are objects, not throws — turn them into real failures. */
export function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): NonNullable<T> {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('no rows returned');
  return result.data as NonNullable<T>;
}

export const NOTE_COLUMNS =
  'id, title, content, type, color, x, y, width, height, parent_id, due_at, z_index';
