import { z } from 'zod';

/**
 * The tool surface an LLM sees. These describe what the agent may SEND; the
 * API re-validates everything at its own boundary, because a client-side
 * schema is documentation, not a trust boundary.
 *
 * The two enums are spelled out here rather than imported from the web app so
 * this package depends on nothing but fetch.
 */

export const NOTE_TYPES = [
  'idea',
  'task',
  'question',
  'decision',
  'reference',
  'thought',
  'summary',
] as const;

export const REL_TYPES = [
  'related',
  'depends_on',
  'supports',
  'contradicts',
  'derived_from',
  'child_of',
] as const;

export const noteType = z.enum(NOTE_TYPES);
export const relType = z.enum(REL_TYPES);
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const noteInputSchema = z.object({
  clientKey: z
    .string()
    .min(1)
    .describe('Your own unique label for this note, used by parentKey/relations/groups.'),
  title: z.string().max(80).nullish().describe('Short headline. Omit for a one-liner note.'),
  content: z.string().min(1).describe('The note body — one idea, a couple of sentences at most.'),
  type: noteType.default('idea'),
  color: hexColor.nullish().describe('Rarely needed: colour is derived from type.'),
  parentKey: z
    .string()
    .nullish()
    .describe(
      'clientKey of the note this one sits under, or the uuid of a note already in the space. Null for a top-level note.'
    ),
  dueAt: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .describe('ISO 8601 instant this note is for, when the source states one.'),
});

export const relationInputSchema = z.object({
  from: z.string().describe('clientKey or existing note uuid'),
  to: z.string().describe('clientKey or existing note uuid'),
  type: relType.default('related'),
});

export const groupInputSchema = z.object({
  title: z.string().min(1).describe('Frame label, e.g. "Risks" or "Q3 launch".'),
  color: z.string().nullish(),
  memberKeys: z
    .array(z.string().min(1))
    .min(1)
    .describe('clientKeys of the notes this frame should enclose.'),
});
