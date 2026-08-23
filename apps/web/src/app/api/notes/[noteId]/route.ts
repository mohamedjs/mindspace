import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NOTE_TYPES } from '@/features/ai/schemas/extraction';
import { NOTE_COLUMNS } from '@/infrastructure/supabase/mappers';
import { authed } from '@/lib/api/auth';
import { ApiError, body, noContent, route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ noteId: string }> };

/** GET /api/notes/{note_id} */
export const GET = route(async (req: Request, { params }: Params) => {
  const { noteId } = await params;
  const { client } = await authed(req);
  const { data } = await client
    .from('sticky_notes')
    .select(NOTE_COLUMNS)
    .eq('id', noteId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) throw new ApiError('note_not_found', 404, `note not found: ${noteId}`);
  return NextResponse.json(data);
});

const patchNote = z
  .object({
    title: z.string().max(80).nullish(),
    content: z.string().min(1).optional(),
    type: z.enum(NOTE_TYPES).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .nullish(),
    parent_id: z.string().uuid().nullish(),
    due_at: z.string().datetime({ offset: true }).nullish(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'nothing to update',
  });

/**
 * PATCH /api/notes/{note_id} — partial update: edit, move, re-parent, recolour.
 *
 * The contract splits this into five single-field routes for the web client;
 * this general one exists for agents, which change several fields at once.
 * Position-only patches still emit no timeline event — `on_note_change()`
 * (0009_timeline.sql) keys off content/type, not off which route wrote the row.
 */
export const PATCH = route(async (req: Request, { params }: Params) => {
  const { noteId } = await params;
  const { client } = await authed(req);
  const fields = await body(req, patchNote);
  if (fields.parent_id === noteId) {
    throw new ApiError('invalid_parent', 400, 'a note cannot be its own parent');
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) patch[key] = value;
  }

  return NextResponse.json(
    unwrap(
      await client
        .from('sticky_notes')
        .update(patch)
        .eq('id', noteId)
        .is('deleted_at', null)
        .select(NOTE_COLUMNS)
        .single()
    )
  );
});

/** DELETE /api/notes/{note_id} — soft delete; the trigger promotes children. */
export const DELETE = route(async (req: Request, { params }: Params) => {
  const { noteId } = await params;
  const { client } = await authed(req);
  unwrap(
    await client
      .from('sticky_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', noteId)
      .is('deleted_at', null)
      .select('id')
      .single()
  );
  return noContent();
});
