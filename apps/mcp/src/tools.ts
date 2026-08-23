import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from './api.ts';
import { hexColor, noteType, relType } from './schemas.ts';

export function ok(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

export function registerTools(server: McpServer) {
  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description:
        "The user's boards, most recently active first. Start here: pick an existing space before creating a new one.",
      inputSchema: {},
    },
    async () => ok(await api('GET', '/api/spaces'))
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
    async ({ name, emoji }) => ok(await api('POST', '/api/spaces', { body: { name, emoji } }))
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
      const [notes, groups, relationships] = await Promise.all([
        api('GET', `/api/spaces/${spaceId}/notes`),
        api('GET', `/api/spaces/${spaceId}/groups`),
        api('GET', `/api/spaces/${spaceId}/relationships`),
      ]);
      return ok({ notes, groups, relationships });
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
        color: hexColor.optional(),
        parentId: z.string().uuid().optional().describe('Nest under an existing note.'),
        dueAt: z.string().datetime({ offset: true }).optional(),
        x: z.number().optional(),
        y: z.number().optional(),
      },
    },
    async ({ spaceId, content, title, type, color, parentId, dueAt, x, y }) =>
      ok(
        await api('POST', `/api/spaces/${spaceId}/notes`, {
          body: {
            content,
            title,
            type,
            color,
            parent_id: parentId,
            due_at: dueAt,
            source_type: 'ai',
            x,
            y,
          },
        })
      )
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
        color: hexColor.nullish(),
        parentId: z.string().uuid().nullish(),
        dueAt: z.string().datetime({ offset: true }).nullish(),
        x: z.number().optional(),
        y: z.number().optional(),
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
      },
    },
    async ({ noteId, parentId, dueAt, ...fields }) =>
      ok(
        await api('PATCH', `/api/notes/${noteId}`, {
          body: {
            ...fields,
            ...(parentId !== undefined ? { parent_id: parentId } : {}),
            ...(dueAt !== undefined ? { due_at: dueAt } : {}),
          },
        })
      )
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
      await api('DELETE', `/api/notes/${noteId}`);
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
    async ({ fromNoteId, toNoteId, type }) =>
      ok(
        await api('POST', '/api/relationships', {
          body: { from_note_id: fromNoteId, to_note_id: toNoteId, type, created_by: 'ai' },
        })
      )
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
    async ({ fromNoteId, toNoteId, type }) =>
      ok(
        await api('DELETE', '/api/relationships', {
          query: { from_note_id: fromNoteId, to_note_id: toNoteId, type },
        })
      )
  );
}
