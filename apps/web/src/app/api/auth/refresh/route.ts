import { NextResponse } from 'next/server';
import { createAnonServerClient } from '@/infrastructure/supabase/bearer';
import { z } from 'zod';
import { ApiError, body, route } from '@/lib/api/http';

/**
 * POST /api/auth/refresh — trade a refresh token for a fresh access token.
 *
 * The only piece of contract §1 this branch implements, and only because a
 * long-lived non-browser client (the MCP server) would otherwise die an hour
 * into a session with nothing able to renew it. Sign-in/sign-up stay with
 * Supabase Auth for now.
 */
export const POST = route(async (req: Request) => {
  const { refresh_token } = await body(req, z.object({ refresh_token: z.string().min(1) }));

  const client = createAnonServerClient();

  const { data, error } = await client.auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    throw new ApiError('invalid_token', 401, error?.message ?? 'refresh token rejected');
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    token_type: 'bearer',
    expires_in: data.session.expires_in,
    user: {
      id: data.user!.id,
      email: data.user!.email,
      user_metadata: data.user!.user_metadata,
    },
  });
});
