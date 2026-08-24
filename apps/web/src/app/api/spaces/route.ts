import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SPACE_COLUMNS } from '@/infrastructure/supabase/mappers';
import { authed } from '@/lib/api/auth';
import { body, route, unwrap } from '@/lib/api/http';

/** GET /api/spaces — the caller's boards, most recently active first. */
export const GET = route(async (req: Request) => {
  const { client } = await authed(req);
  return NextResponse.json(
    unwrap(
      await client
        .from('spaces')
        .select(SPACE_COLUMNS)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false })
    )
  );
});

const createSpace = z.object({
  name: z.string().min(1).max(80),
  emoji: z.string().max(8).optional(),
});

/** POST /api/spaces */
export const POST = route(async (req: Request) => {
  const { client } = await authed(req);
  const { name, emoji } = await body(req, createSpace);
  return NextResponse.json(
    unwrap(
      await client
        .from('spaces')
        .insert({ name, ...(emoji ? { emoji } : {}) })
        .select(SPACE_COLUMNS)
        .single()
    ),
    { status: 201 }
  );
});
