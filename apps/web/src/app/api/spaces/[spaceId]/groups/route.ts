import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GROUP_COLUMNS } from '@/infrastructure/supabase/mappers';
import { authed, requireSpace } from '@/lib/api/auth';
import { body, route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ spaceId: string }> };

/** GET /api/spaces/{space_id}/groups */
export const GET = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  return NextResponse.json(
    unwrap(
      await client
        .from('note_groups')
        .select(GROUP_COLUMNS)
        .eq('space_id', spaceId)
        .is('deleted_at', null)
    )
  );
});

const createGroup = z.object({
  title: z.string().min(1).optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  color: z.string().nullish(),
});

/** POST /api/spaces/{space_id}/groups */
export const POST = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  const input = await body(req, createGroup);
  return NextResponse.json(
    unwrap(
      await client
        .from('note_groups')
        .insert({ space_id: spaceId, ...input })
        .select(GROUP_COLUMNS)
        .single()
    ),
    { status: 201 }
  );
});
