import { z } from 'zod';
import { authed } from '@/lib/api/auth';
import { body, noContent, route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ groupId: string }> };

const patchGroup = z
  .object({
    title: z.string().min(1).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    color: z.string().nullish(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'nothing to update',
  });

/** PATCH /api/groups/{group_id} */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const { groupId } = await params;
  const { client } = await authed(req);
  const fields = await body(req, patchGroup);
  const patch = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  unwrap(
    await client
      .from('note_groups')
      .update(patch)
      .eq('id', groupId)
      .is('deleted_at', null)
      .select('id')
      .single()
  );
  return noContent();
});

/** DELETE /api/groups/{group_id} — soft delete. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const { groupId } = await params;
  const { client } = await authed(req);
  unwrap(
    await client
      .from('note_groups')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', groupId)
      .is('deleted_at', null)
      .select('id')
      .single()
  );
  return noContent();
});
