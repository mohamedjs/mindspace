import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authed, requireSpace } from '@/lib/api/auth';
import { ApiError, body, route, unwrap } from '@/lib/api/http';
import {
  groupInputSchema,
  noteInputSchema,
  relationInputSchema,
  structureNotes,
  type ExistingNote,
} from '@/lib/api/structure';

type Params = { params: Promise<{ spaceId: string }> };

const ingest = z.object({
  notes: z.array(noteInputSchema).min(1).max(200),
  relations: z.array(relationInputSchema).default([]),
  groups: z.array(groupInputSchema).default([]),
});

/**
 * POST /api/spaces/{space_id}/ingest — write a whole structured note tree in
 * one call.
 *
 * All the structuring — topological sort, parent resolution, colour from type,
 * canvas layout, group frames — happens HERE, not in the caller. The MCP
 * server (and any future agent client) posts the tree and reads back the ids.
 */
export const POST = route(async (req: Request, { params }: Params) => {
  const { spaceId } = await params;
  const { client } = await authed(req);
  await requireSpace(client, spaceId);
  const input = await body(req, ingest);

  const existing = unwrap(
    await client
      .from('sticky_notes')
      .select('id, x, y, width, height, parent_id')
      .eq('space_id', spaceId)
      .is('deleted_at', null)
  ) as ExistingNote[];

  let structured;
  try {
    structured = structureNotes({ spaceId, ...input, existing });
  } catch (err) {
    // Cycles and duplicate clientKeys are caller mistakes, not server faults.
    throw new ApiError('invalid_structure', 422, err instanceof Error ? err.message : String(err));
  }

  // structureNotes dedupes within the payload, but a relation between two notes
  // ALREADY on the board may already exist — rel_unique would then reject the
  // whole insert and take the fresh notes down with it.
  const live = unwrap(
    await client
      .from('relationships')
      .select('from_note_id, to_note_id, type')
      .eq('space_id', spaceId)
      .is('deleted_at', null)
  ) as { from_note_id: string; to_note_id: string; type: string }[];
  const liveKeys = new Set(live.map((r) => `${r.from_note_id}|${r.to_note_id}|${r.type}`));
  const newRelationships = structured.relationships.filter(
    (r) => !liveKeys.has(`${r.from_note_id}|${r.to_note_id}|${r.type}`)
  );

  // ponytail: three statements, no transaction — PostgREST has none and an RPC
  // would need a migration (no schema changes on this branch). Notes are the
  // one that matters and it is atomic on its own; if the follow-ups fail we
  // roll the notes back by soft-delete and say so.
  const inserted = unwrap(
    await client.from('sticky_notes').insert(structured.notes).select('id')
  ) as { id: string }[];

  try {
    if (newRelationships.length) {
      unwrap(await client.from('relationships').insert(newRelationships).select('id'));
    }
    if (structured.groups.length) {
      unwrap(await client.from('note_groups').insert(structured.groups).select('id'));
    }
  } catch (err) {
    await client
      .from('sticky_notes')
      .update({ deleted_at: new Date().toISOString() })
      .in(
        'id',
        inserted.map((row) => row.id)
      );
    throw new ApiError(
      'ingest_rolled_back',
      500,
      `rolled back ${inserted.length} notes: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return NextResponse.json(
    {
      space_id: spaceId,
      note_count: structured.notes.length,
      relationship_count: newRelationships.length,
      group_count: structured.groups.length,
      note_ids_by_key: Object.fromEntries(structured.idByKey),
    },
    { status: 201 }
  );
});
