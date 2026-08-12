import { z } from 'zod';

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

export const extractedNoteSchema = z.object({
  /** Temporary handle the model uses so relations can reference a note. */
  clientKey: z.string(),
  title: z.string().max(80).nullable().optional(),
  content: z.string().min(1),
  type: z.enum(NOTE_TYPES).catch('idea'),
  /** clientKey of the idea this note elaborates on, or an existing note's id, or null. */
  parentClientKey: z.string().nullable().optional(),
  /**
   * ISO 8601 instant the note is for. `.catch(null)` because a model that
   * fumbles one date should cost that note its reminder, not the whole
   * extraction — every other field is still good.
   */
  dueAt: z
    .string()
    .datetime({ offset: true })
    .nullable()
    .optional()
    .catch(null),
  /** Character offsets into the transcript this note came from. */
  spanStart: z.number().int().nonnegative().nullable().optional(),
  spanEnd: z.number().int().nonnegative().nullable().optional(),
  /** Usually omitted — the server fills it in from the note type. */
  color: z.string().nullable().optional(),
});

export const extractedRelationSchema = z.object({
  /** clientKeys, not UUIDs — the model has no database ids to work with. */
  from: z.string(),
  to: z.string(),
  type: z.enum(REL_TYPES).catch('related'),
});

export const NOTE_COLORS: Record<(typeof NOTE_TYPES)[number], string> = {
  idea: '#FFF8BC',
  task: '#C8E6C9',
  question: '#BBDEFB',
  decision: '#F8BBD0',
  reference: '#E1BEE7',
  thought: '#FFE0B2',
  summary: '#B2EBF2',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function colorForNote(
  type: keyof typeof NOTE_COLORS,
  proposed?: string | null
): string {
  return proposed && HEX.test(proposed) ? proposed : NOTE_COLORS[type];
}

/** Hard cap from the plan's rules: max 6 notes per 60s of speech, 8 absolute. */
export const MAX_NOTES = 8;

export const extractionSchema = z.object({
  // Deliberately allows []: the prompt tells the model to return no notes when
  // the transcript holds no real thought (a silent or test recording), and
  // rejecting that would turn a correct answer into a 500. A malformed reply
  // still fails, because `notes` itself remains required.
  notes: z.array(extractedNoteSchema),
  relations: z.array(extractedRelationSchema).default([]),
});

export type ExtractedNote = z.infer<typeof extractedNoteSchema>;
export type ExtractedRelation = z.infer<typeof extractedRelationSchema>;
export type Extraction = z.infer<typeof extractionSchema>;

/**
 * Models wrap JSON in prose or fences even in JSON mode. Pull out the first
 * balanced {...} block rather than trusting the whole reply to parse.
 */
export function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();

  const start = candidate.indexOf('{');
  if (start === -1) return candidate;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < candidate.length; i++) {
    const char = candidate[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return candidate.slice(start, i + 1);
    }
  }

  // Unbalanced — hand back what we have and let the parse fail loudly.
  return candidate.slice(start);
}

/**
 * Parses a model reply into a validated Extraction.
 * Drops relations pointing at notes that don't exist instead of failing the
 * whole extraction — a bad edge shouldn't cost the user their notes.
 */
export function parseExtraction(raw: string): Extraction {
  const parsed = extractionSchema.parse(JSON.parse(extractJsonBlock(raw)));

  // Trim rather than reject: a model that returns 9 notes should cost the user
  // one note, not the whole extraction.
  const notes = parsed.notes.slice(0, MAX_NOTES);

  const seen = new Map<string, number>();
  for (const note of notes) seen.set(note.clientKey, (seen.get(note.clientKey) ?? 0) + 1);
  // A key used twice cannot identify a note, so a relation touching it would
  // silently attach to the wrong one — drop the relation, keep both notes.
  const usableKey = (key: string) => seen.get(key) === 1;

  // A parentClientKey naming a clientKey from THIS batch must be unambiguous,
  // same as a relation endpoint. A key that isn't in `seen` at all is left
  // untouched — it's presumed to be an existing note's real id, which the
  // caller (with DB access) resolves; this function only knows the batch.
  // Self-reference is always invalid regardless.
  const notesWithValidParents = notes.map((note) => {
    const key = note.parentClientKey;
    if (!key || key === note.clientKey) return { ...note, parentClientKey: null };
    if (seen.has(key) && !usableKey(key)) return { ...note, parentClientKey: null };
    return note;
  });

  return {
    notes: notesWithValidParents,
    relations: parsed.relations.filter(
      (rel) => usableKey(rel.from) && usableKey(rel.to) && rel.from !== rel.to
    ),
  };
}

export interface ParentResolutionContext {
  /** clientKey -> array index within this batch, for the parent-before-child rule. */
  batchIndex: Map<string, number>;
  /** clientKey -> the real id assigned to that note (generated before insert). */
  batchIds: Map<string, string>;
  /** ids of notes that already exist in the space, from an earlier recording. */
  existingIds: Set<string>;
}

/**
 * Resolves a note's parentClientKey to a real sticky_notes.id, or null.
 *
 * A same-batch reference only resolves if the parent appears earlier in the
 * array — Postgres FK checks are deferred to the end of a multi-row INSERT,
 * so without this ordering check a same-batch cycle or forward reference
 * would otherwise commit. An existing note always resolves since it's
 * already committed and can't depend on a note that isn't inserted yet.
 * Anything else (hallucinated key, unknown id) silently drops to top-level
 * instead of failing the whole extraction.
 */
export function resolveParentId(
  note: { clientKey: string; parentClientKey?: string | null },
  index: number,
  ctx: ParentResolutionContext
): string | null {
  const key = note.parentClientKey;
  if (!key) return null;

  const parentIndex = ctx.batchIndex.get(key);
  if (parentIndex !== undefined) {
    return parentIndex < index ? ctx.batchIds.get(key) ?? null : null;
  }

  return ctx.existingIds.has(key) ? key : null;
}
