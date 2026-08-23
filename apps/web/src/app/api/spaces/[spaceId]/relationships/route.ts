import { NextResponse } from 'next/server';
import { authed, requireSpace } from '@/lib/api/auth';
import { route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ spaceId: string }> };

/** GET /api/spaces/{space_id}/relationships */
export const GET = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  return NextResponse.json(
    unwrap(
      await client
        .from('relationships')
        .select('id, from_note_id, to_note_id, type, created_by, created_at')
        .eq('space_id', spaceId)
        .is('deleted_at', null)
    )
  );
});
