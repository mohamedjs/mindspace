import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db, unwrap } from './db.ts';
import {
  groupInputSchema,
  noteInputSchema,
  relationInputSchema,
  structureNotes,
  type ExistingNote,
} from './structure.ts';
import { ok, requireSpace } from './tools.ts';

const INGEST_DESCRIPTION = `Write a whole structured note tree into a MindSpace space in one call — this is the main tool.

You do the thinking: read the document, talk, plan or transcript yourself and decide what the notes ARE. This tool does the writing: it assigns ids, resolves parent links, picks colours from note type, lays every note out on the canvas (top-level notes on a 4-column grid, sub-notes orbiting their parent) and draws group frames. Order does not matter — a child may be listed before its parent.

How to structure well:
- One idea per note. Content is a sentence or two, not a paragraph dump.
- Use parentKey to nest detail under the idea it belongs to. Two levels deep reads best.
- type drives colour and meaning: idea / task / question / decision / reference / thought / summary.
- Use relations for cross-links the tree can't express: depends_on, supports, contradicts, derived_from, related.
- Use groups for the document's top-level sections ("Risks", "Phase 1"); each becomes a labelled frame drawn behind its notes.
- parentKey and relation endpoints also accept the uuid of a note already in the space, so you can graft onto an existing board.
- Call get_space first when adding to a space that already has notes, so you don't duplicate what is there.`;

export function registerIngest(server: McpServer) {
  server.registerTool(
    'ingest_notes',
    {
      title: 'Ingest a document as a note tree',
      description: INGEST_DESCRIPTION,
      inputSchema: {
        spaceId: z.string().uuid().describe('Target space. Use list_spaces or create_space first.'),
        notes: z.array(noteInputSchema).min(1).max(200),
        relations: z.array(relationInputSchema).default([]),
        groups: z.array(groupInputSchema).default([]),
      },
    },
    async ({ spaceId, notes, relations, groups }) => {
      const client = await db();
      await requireSpace(client, spaceId);

      const existing = unwrap(
        await client
          .from('sticky_notes')
          .select('id, x, y, width, height, parent_id')
          .eq('space_id', spaceId)
          .is('deleted_at', null)
      ) as ExistingNote[];

      const structured = structureNotes({ spaceId, notes, relations, groups, existing });

      // structureNotes dedupes within the payload, but a relation between two
      // notes ALREADY on the board may already exist — rel_unique would then
      // reject the whole insert and take the fresh notes down with it.
      const live = unwrap(
        await client
          .from('relationships')
          .select('from_note_id, to_note_id, type')
          .eq('space_id', spaceId)
          .is('deleted_at', null)
      ) as { from_note_id: string; to_note_id: string; type: string }[];
      const liveKeys = new Set(
        live.map((r) => `${r.from_note_id}|${r.to_note_id}|${r.type}`)
      );
      const newRelationships = structured.relationships.filter(
        (r) => !liveKeys.has(`${r.from_note_id}|${r.to_note_id}|${r.type}`)
      );

      // ponytail: three statements, no transaction — PostgREST has none and an
      // RPC would need a migration (owned by another branch). Notes are the
      // one that matters and it is atomic on its own; if the follow-ups fail
      // we roll the notes back by soft-delete and say so.
      const inserted = unwrap(
        await client.from('sticky_notes').insert(structured.notes).select('id')
      );

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
        throw new Error(
          `rolled back ${inserted.length} notes: ${err instanceof Error ? err.message : String(err)}`
        );
      }

      return ok({
        spaceId,
        noteCount: structured.notes.length,
        relationshipCount: newRelationships.length,
        groupCount: structured.groups.length,
        noteIdsByKey: Object.fromEntries(structured.idByKey),
      });
    }
  );
}
