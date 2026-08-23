import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side clients for the route handlers under app/api.
 *
 * These live in infrastructure/ because that is the only layer allowed to
 * touch the database driver — see core/architecture.test.ts. The routes and
 * lib/api/ import from here rather than reaching for @supabase/supabase-js
 * themselves, so the boundary that makes the FastAPI migration a backend swap
 * stays intact.
 */
export type Db = SupabaseClient<any, any, any>;

const URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVER_AUTH = { persistSession: false, autoRefreshToken: false } as const;

/**
 * A client carrying the CALLER's access token — never the service-role key.
 * The token is forwarded to PostgREST, so RLS still runs in Postgres and
 * auth.uid() is the caller.
 */
export function createBearerClient(token: string): Db {
  return createClient(URL(), ANON(), {
    auth: SERVER_AUTH,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** An unauthenticated client, for the calls that trade one token for another. */
export function createAnonServerClient(): Db {
  return createClient(URL(), ANON(), { auth: SERVER_AUTH });
}
