import { createClient, SupabaseClient } from '@supabase/supabase-js';

function required(name: string): string {
  const value = Deno.env.get(name);
  // Fail at module load with the missing name, rather than as an opaque 500
  // from the first query that happens to use a silently-broken client.
  if (!value) throw new Error(`missing required env var: ${name}`);
  return value;
}

const SUPABASE_URL = required('SUPABASE_URL');
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY = required('SUPABASE_ANON_KEY');

/** Service-role client — bypasses RLS. Never expose results blindly to callers. */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client bound to the caller's JWT. RLS applies, and auth.uid() resolves inside
 * the credit RPCs — which is what makes reserve/settle/release safe to call.
 */
export function userClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
