import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { api } from './api.ts';
import { groupInputSchema, noteInputSchema, relationInputSchema } from './schemas.ts';
import { ok } from './tools.ts';

const INGEST_DESCRIPTION = `Write a whole structured note tree into a MindSpace space in one call — this is the main tool.

You do the thinking: read the document, talk, plan or transcript yourself and decide what the notes ARE. This tool does the writing: it assigns ids, resolves parent links, picks colours from note type, lays every note out on the canvas (top-level notes on a grid, sub-notes orbiting their parent) and draws group frames. Order does not matter — a child may be listed before its parent.

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
    // Validate, POST, return. The sorting, layout and colour work all happens
    // in the API route — keeping it here would have bought this change nothing.
    async ({ spaceId, notes, relations, groups }) =>
      ok(await api('POST', `/api/spaces/${spaceId}/ingest`, { body: { notes, relations, groups } }))
  );
}
