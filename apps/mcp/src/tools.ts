import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { NOTE_COLUMNS, db, unwrap, type Db } from './db.ts';
import {
  NOTE_TYPES,
  REL_TYPES,
  colorForNote,
} from '../../../supabase/functions/_shared/extraction.ts';
import { layoutNewNotes, placeChild } from '../../../supabase/functions/_shared/layout.ts';

export function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

/**
 * RLS keeps a foreign space unreadable but would still happily accept an
 * INSERT that names one (only user_id is policed, not space_id), leaving notes
 * stranded on someone else's board. One SELECT closes that.
 */
export async function requireSpace(client: Db, spaceId: string) {
  const { data } = await client
    .from('spaces')
    .select('id')
    .eq('id', spaceId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!data) throw new Error(`space not found: ${spaceId}`);
}

const noteType = z.enum(NOTE_TYPES);
const relType = z.enum(REL_TYPES);

export function registerTools(server: McpServer) {
  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description:
        "The user's boards, most recently active first. Start here: pick an existing space before creating a new one.",
      inputSchema: {},
    },
    async () => {
      const client = await db();
      return ok(
        unwrap(
          await client
            .from('spaces')
            .select('id, name, emoji, note_count, last_activity_at')
            .is('deleted_at', null)
            .order('last_activity_at', { ascending: false })
        )
      );
    }
  );

  server.registerTool(
    'create_space',
    {
      title: 'Create a space',
      description:
        'A new empty board. One space per topic or project — do not create one per document if an existing space already covers the subject.',
      inputSchema: {
        name: z.string().min(1).max(80),
        emoji: z.string().max(8).optional().describe('Board icon, defaults to a lightbulb.'),
      },
    },
    async ({ name, emoji }) => {
      const client = await db();
      return ok(
        unwrap(
          await client
            .from('spaces')
            .insert({ name, ...(emoji ? { emoji } : {}) })
            .select('id, name, emoji')
            .single()
        )
      );
    }
  );

  server.registerTool(
    'get_space',
    {
      title: 'Read a space',
      description:
        'Everything on one board: notes (with parent_id, position and type), group frames and relationships. Read this before adding to a board that already has notes, and to find the note ids that update_note / link_notes / delete_note need.',
      inputSchema: { spaceId: z.string().uuid() },
    },
    async ({ spaceId }) => {
      const client = await db();
      await requireSpace(client, spaceId);
      const [notes, groups, relationships] = await Promise.all([
        client.from('sticky_notes').select(NOTE_COLUMNS).eq('space_id', spaceId).is('deleted_at', null),
        client.from('note_groups').select('id, title, x, y, width, height, color').eq('space_id', spaceId).is('deleted_at', null),
        client.from('relationships').select('id, from_note_id, to_note_id, type').eq('space_id', spaceId).is('deleted_at', null),
      ]);
      return ok({
        notes: unwrap(notes),
        groups: unwrap(groups),
        relationships: unwrap(relationships),
      });
    }
  );

  server.registerTool(
    'create_note',
    {
      title: 'Create one note',
      description:
        'A single sticky note. For anything with structure — several notes, nesting, groups — use ingest_notes instead; it lays the whole tree out in one call. Position is chosen automatically (free grid slot, or orbiting the parent) unless you pass x and y.',
      inputSchema: {
        spaceId: z.string().uuid(),
        content: z.string().min(1),
        title: z.string().max(80).optional(),
        type: noteType.default('idea'),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        parentId: z.string().uuid().optional().describe('Nest under an existing note.'),
        dueAt: z.string().datetime({ offset: true }).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async ({ spaceId, content, title, type, color, parentId, dueAt, x, y }) => {
      const client = await db();
      await requireSpace(client, spaceId);

      const existing = unwrap(
        await client
          .from('sticky_notes')
          .select('id, x, y, width, height, parent_id')
          .eq('space_id', spaceId)
          .is('deleted_at', null)
      );

      const parent = parentId ? existing.find((n) => n.id === parentId) : undefined;
      if (parentId && !parent) throw new Error(`parent note not in this space: ${parentId}`);

      const rect =
        x !== undefined && y !== undefined
          ? { x, y, width: 190, height: 145 }
          : parent
            ? placeChild(parent, existing.filter((n) => n.parent_id === parentId).length, existing)
            : layoutNewNotes(1, existing.filter((n) => !n.parent_id))[0];

      return ok(
        unwrap(
          await client
            .from('sticky_notes')
            .insert({
              space_id: spaceId,
              title: title ?? null,
              content,
              type,
              color: colorForNote(type, color),
              ...rect,
              parent_id: parentId ?? null,
              due_at: dueAt ?? null,
              source_type: 'ai',
            })
            .select('id, x, y')
            .single()
        )
      );
    }
  );

  server.registerTool(
    'update_note',
    {
      title: 'Update / move / re-parent a note',
      description:
        'Edit one note in place. Every field is optional — send only what changes. Also handles moving (x/y), re-parenting (parentId, or null to pull a note back to top level) and clearing a due date (dueAt: null).',
      inputSchema: {
        noteId: z.string().uuid(),
        title: z.string().max(80).nullish(),
        content: z.string().min(1).optional(),
        type: noteType.optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
        parentId: z.string().uuid().nullish(),
        dueAt: z.string().datetime({ offset: true }).nullish(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      },
    },
    async ({ noteId, ...fields }) => {
      const client = await db();
      if (fields.parentId === noteId) throw new Error('a note cannot be its own parent');

      const patch: Record<string, unknown> = {};
      const map = {
        title: 'title',
        content: 'content',
        type: 'type',
        color: 'color',
        parentId: 'parent_id',
        dueAt: 'due_at',
        x: 'x',
        y: 'y',
        width: 'width',
        height: 'height',
      } as const;
      for (const [key, column] of Object.entries(map)) {
        const value = fields[key as keyof typeof map];
        if (value !== undefined) patch[column] = value;
      }
      if (!Object.keys(patch).length) throw new Error('nothing to update');
      patch.updated_at = new Date().toISOString();

      return ok(
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
    }
  );

  server.registerTool(
    'delete_note',
    {
      title: 'Delete a note',
      description:
        'Soft-deletes the note — it leaves the board but stays recoverable, and its children are promoted to top level rather than disappearing with it. Delete children first if you meant to remove a whole branch.',
      inputSchema: { noteId: z.string().uuid() },
    },
    async ({ noteId }) => {
      const client = await db();
      unwrap(
        await client
          .from('sticky_notes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', noteId)
          .is('deleted_at', null)
          .select('id')
          .single()
      );
      return ok({ noteId, deleted: true });
    }
  );

  server.registerTool(
    'link_notes',
    {
      title: 'Link two notes',
      description:
        'Draws a typed connector between two existing notes: depends_on, supports, contradicts, derived_from or related. Use this for cross-links; parent/child nesting is done with update_note or ingest_notes. Re-linking the same pair and type is a no-op.',
      inputSchema: {
        fromNoteId: z.string().uuid(),
        toNoteId: z.string().uuid(),
        type: relType.default('related'),
      },
    },
    async ({ fromNoteId, toNoteId, type }) => {
      const client = await db();
      if (fromNoteId === toNoteId) throw new Error('a note cannot link to itself');

      // Both ends, one query: nothing in the schema stops a relationship from
      // spanning two boards, and such an edge renders on one board pointing at
      // a note that isn't loaded.
      const ends = unwrap<{ id: string; space_id: string }[]>(
        await client
          .from('sticky_notes')
          .select('id, space_id')
          .in('id', [fromNoteId, toNoteId])
          .is('deleted_at', null)
      );
      if (ends.length !== 2) throw new Error('both notes must exist and not be deleted');
      if (ends[0].space_id !== ends[1].space_id) {
        throw new Error('cannot link notes that live in different spaces');
      }

      const { data, error } = await client
        .from('relationships')
        .insert({
          space_id: ends[0].space_id,
          from_note_id: fromNoteId,
          to_note_id: toNoteId,
          type,
          created_by: 'ai',
        })
        .select('id, from_note_id, to_note_id, type')
        .single();

      // rel_unique is a PARTIAL index (where deleted_at is null), which
      // ON CONFLICT can't use as an arbiter — so let the duplicate happen and
      // read 23505 as "already linked", which is the no-op we promise.
      if (error && (error as { code?: string }).code !== '23505') throw new Error(error.message);
      return ok(data ?? { fromNoteId, toNoteId, type, alreadyLinked: true });
    }
  );

  server.registerTool(
    'unlink_notes',
    {
      title: 'Remove a link',
      description:
        'Soft-deletes the connector between two notes. Pass the same from/to/type you linked with, or omit type to remove every link between the pair in that direction.',
      inputSchema: {
        fromNoteId: z.string().uuid(),
        toNoteId: z.string().uuid(),
        type: relType.optional(),
      },
    },
    async ({ fromNoteId, toNoteId, type }) => {
      const client = await db();
      let query = client
        .from('relationships')
        .update({ deleted_at: new Date().toISOString() })
        .eq('from_note_id', fromNoteId)
        .eq('to_note_id', toNoteId)
        .is('deleted_at', null);
      if (type) query = query.eq('type', type);

      return ok({ removed: unwrap(await query.select('id')).length });
    }
  );
}
