import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NOTE_TYPES, colorForNote } from '@/features/ai/schemas/extraction';
import { layoutNewNotes, placeChild } from '@/features/ai/services/layout';
import { NOTE_COLUMNS } from '@/infrastructure/supabase/mappers';
import { authed, requireSpace } from '@/lib/api/auth';
import { body, route, unwrap } from '@/lib/api/http';

type Params = { params: Promise<{ spaceId: string }> };

/** GET /api/spaces/{space_id}/notes */
export const GET = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  return NextResponse.json(
    unwrap(
      await client
        .from('sticky_notes')
        .select(NOTE_COLUMNS)
        .eq('space_id', spaceId)
        .is('deleted_at', null)
    )
  );
});

const createNote = z.object({
  content: z.string().min(1),
  title: z.string().max(80).nullish(),
  type: z.enum(NOTE_TYPES).default('idea'),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullish(),
  parent_id: z.string().uuid().nullish(),
  due_at: z.string().datetime({ offset: true }).nullish(),
  // Contract default. Agents pass 'ai' so the board can tell who wrote what.
  source_type: z.enum(['manual', 'ai']).default('manual'),
  // Optional, unlike the contract's row: when absent the server picks the
  // slot. Layout is server-side business logic, not the caller's problem.
  x: z.number().optional(),
  y: z.number().optional(),
});

/** POST /api/spaces/{space_id}/notes */
export const POST = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  const input = await body(req, createNote);

  const existing = unwrap(
    await client
      .from('sticky_notes')
      .select('id, x, y, width, height, parent_id')
      .eq('space_id', spaceId)
      .is('deleted_at', null)
  ) as { id: string; x: number; y: number; width: number; height: number; parent_id: string | null }[];

  const parent = input.parent_id ? existing.find((n) => n.id === input.parent_id) : undefined;
  if (input.parent_id && !parent) {
    return NextResponse.json(
      { error: 'parent_note_not_found', message: `parent note not in this space: ${input.parent_id}` },
      { status: 404 }
    );
  }

  const rect =
    input.x !== undefined && input.y !== undefined
      ? { x: input.x, y: input.y, width: 190, height: 145 }
      : parent
        ? placeChild(parent, existing.filter((n) => n.parent_id === input.parent_id).length, existing)
        : layoutNewNotes(1, existing.filter((n) => !n.parent_id))[0];

  return NextResponse.json(
    unwrap(
      await client
        .from('sticky_notes')
        .insert({
          space_id: spaceId,
          title: input.title ?? null,
          content: input.content,
          type: input.type,
          color: colorForNote(input.type, input.color),
          ...rect,
          parent_id: input.parent_id ?? null,
          due_at: input.due_at ?? null,
          source_type: input.source_type,
        })
        .select(NOTE_COLUMNS)
        .single()
    ),
    { status: 201 }
  );
});
