import { NextResponse } from 'next/server';
import { z } from 'zod';
import { REL_TYPES } from '@/features/ai/schemas/extraction';
import { authed } from '@/lib/api/auth';
import { ApiError, body, route, unwrap } from '@/lib/api/http';

const link = z.object({
  from_note_id: z.string().uuid(),
  to_note_id: z.string().uuid(),
  type: z.enum(REL_TYPES).default('related'),
  created_by: z.enum(['user', 'ai']).default('user'),
});

/** POST /api/relationships — link two notes. Re-linking the same pair is a no-op. */
export const POST = route(async (req: Request) => {
  const { client } = await authed(req);
  const input = await body(req, link);
  if (input.from_note_id === input.to_note_id) {
    throw new ApiError('invalid_link', 400, 'a note cannot link to itself');
  }

  // Both ends, one query: nothing in the schema stops a relationship from
  // spanning two boards, and such an edge renders on one board pointing at a
  // note that isn't loaded.
  const ends = unwrap(
    await client
      .from('sticky_notes')
      .select('id, space_id')
      .in('id', [input.from_note_id, input.to_note_id])
      .is('deleted_at', null)
  ) as { id: string; space_id: string }[];
  if (ends.length !== 2) {
    throw new ApiError('note_not_found', 404, 'both notes must exist and not be deleted');
  }
  if (ends[0].space_id !== ends[1].space_id) {
    throw new ApiError('cross_space_link', 400, 'cannot link notes that live in different spaces');
  }

  const { data, error } = await client
    .from('relationships')
    .insert({ space_id: ends[0].space_id, ...input })
    .select('id, from_note_id, to_note_id, type')
    .single();

  // rel_unique is a PARTIAL index (where deleted_at is null), which ON CONFLICT
  // can't use as an arbiter — so let the duplicate happen and read 23505 as
  // "already linked", which is the no-op we promise.
  if (error && (error as { code?: string }).code !== '23505') {
    throw new ApiError('internal_error', 500, error.message);
  }
  return NextResponse.json(
    data ?? {
      from_note_id: input.from_note_id,
      to_note_id: input.to_note_id,
      type: input.type,
      already_linked: true,
    },
    { status: data ? 201 : 200 }
  );
});

/**
 * DELETE /api/relationships?from_note_id=&to_note_id=&type= — soft delete.
 * Omit `type` to remove every link between the pair in that direction.
 */
export const DELETE = route(async (req: Request) => {
  const { client } = await authed(req);
  const params = new URL(req.url).searchParams;
  const parsed = z
    .object({
      from_note_id: z.string().uuid(),
      to_note_id: z.string().uuid(),
      type: z.enum(REL_TYPES).optional(),
    })
    .safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    throw new ApiError('validation_error', 422, 'from_note_id and to_note_id are required uuids');
  }

  let query = client
    .from('relationships')
    .update({ deleted_at: new Date().toISOString() })
    .eq('from_note_id', parsed.data.from_note_id)
    .eq('to_note_id', parsed.data.to_note_id)
    .is('deleted_at', null);
  if (parsed.data.type) query = query.eq('type', parsed.data.type);

  return NextResponse.json({ removed: unwrap(await query.select('id')).length });
});
