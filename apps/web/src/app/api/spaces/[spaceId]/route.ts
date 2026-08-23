import { z } from 'zod';
import { authed, requireSpace } from '@/lib/api/auth';
import { body, noContent, route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ spaceId: string }> };

/** PATCH /api/spaces/{space_id} — rename. */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  const { name } = await body(req, z.object({ name: z.string().min(1).max(80) }));
  unwrap(
    await client.from('spaces').update({ name: name.trim() }).eq('id', spaceId).select('id').single()
  );
  return noContent();
});

/** DELETE /api/spaces/{space_id} — soft delete. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  unwrap(
    await client
      .from('spaces')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', spaceId)
      .select('id')
      .single()
  );
  return noContent();
});
