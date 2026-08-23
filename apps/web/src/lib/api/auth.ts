import { createBearerClient, type Db } from '@/infrastructure/supabase/bearer';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { ApiError, bearerToken } from './http';

export type { Db };

/**
 * One Supabase client per request, carrying the CALLER's identity — never the
 * service-role key. `Authorization: Bearer <access_token>` is the required
 * path (that is what the MCP server and any other non-browser client has);
 * a cookie session is accepted too, so the web app can call these routes from
 * a Server Component without a second auth story.
 *
 * Either way RLS still runs in Postgres: the token is forwarded to PostgREST,
 * `auth.uid()` is the caller, and no route can address another user's rows.
 */
export async function authed(req: Request): Promise<{ client: Db; userId: string }> {
  const token = bearerToken(req);

  const client: Db = token
    ? createBearerClient(token)
    : await createSupabaseServerClient();

  // Without this a bogus token would sail past and surface as a raw PostgREST
  // error on the first query instead of a clean 401.
  const { data, error } = await client.auth.getUser(token ?? undefined);
  if (error || !data.user) {
    throw new ApiError('unauthorized', 401, error?.message ?? 'missing or invalid credentials');
  }
  return { client, userId: data.user.id };
}

/**
 * RLS polices `user_id`, not `space_id` — an INSERT naming someone else's
 * space would be accepted and strand the row on their board. One SELECT (which
 * RLS *does* filter) closes that, and it has to live here rather than in a
 * client, because every token holder reaches these routes.
 */
export async function requireSpace(client: Db, spaceId: string): Promise<void> {
  const { data } = await client
    .from('spaces')
    .select('id')
    .eq('id', spaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) throw new ApiError('space_not_found', 404, `space not found: ${spaceId}`);
}
