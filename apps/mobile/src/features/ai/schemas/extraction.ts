import * as yup from 'yup';

export const NOTE_TYPES = [
  'idea',
  'task',
  'question',
  'decision',
  'reference',
  'thought',
  'summary',
] as const;

export type NoteType = (typeof NOTE_TYPES)[number];

export const REL_TYPES = [
  'related',
  'depends_on',
  'supports',
  'contradicts',
  'derived_from',
  'child_of',
] as const;

export type RelType = (typeof REL_TYPES)[number];

const ISO_WITH_OFFSET_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export const extractedNoteSchema = yup.object({
  clientKey: yup.string().required(),
  title: yup.string().max(80).nullable().optional(),
  content: yup.string().required(),
  type: yup
    .string()
    .transform((val) => (typeof val === 'string' && NOTE_TYPES.includes(val as (typeof NOTE_TYPES)[number]) ? val : 'idea'))
    .default('idea'),
  parentClientKey: yup.string().nullable().optional(),
  dueAt: yup
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val || typeof val !== 'string') return null;
      return ISO_WITH_OFFSET_REGEX.test(val) ? val : null;
    }),
  spanStart: yup.number().integer().min(0).nullable().optional(),
  spanEnd: yup.number().integer().min(0).nullable().optional(),
  color: yup.string().nullable().optional(),
});

export const extractedRelationSchema = yup.object({
  from: yup.string().required(),
  to: yup.string().required(),
  type: yup
    .string()
    .transform((val) => (typeof val === 'string' && REL_TYPES.includes(val as (typeof REL_TYPES)[number]) ? val : 'related'))
    .default('related'),
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

export const extractionSchema = yup.object({
  notes: yup.array().of(extractedNoteSchema).required('notes is required'),
  relations: yup.array().of(extractedRelationSchema).default([]),
});

export type ExtractedNote = yup.InferType<typeof extractedNoteSchema>;
export type ExtractedRelation = yup.InferType<typeof extractedRelationSchema>;
export type Extraction = {
  notes: ExtractedNote[];
  relations: ExtractedRelation[];
};

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
  const jsonBlock = extractJsonBlock(raw);
  const rawObj = JSON.parse(jsonBlock);

  if (!rawObj || typeof rawObj !== 'object' || !Array.isArray(rawObj.notes)) {
    throw new Error('notes is required');
  }

  const parsed = extractionSchema.validateSync(rawObj, {
    stripUnknown: true,
  });

  // Trim rather than reject: a model that returns 9 notes should cost the user
  // one note, not the whole extraction.
  const notes = (parsed.notes ?? []).slice(0, MAX_NOTES) as ExtractedNote[];

  const seen = new Map<string, number>();
  for (const note of notes) {
    if (note.clientKey) {
      seen.set(note.clientKey, (seen.get(note.clientKey) ?? 0) + 1);
    }
  }

  // A key used twice cannot identify a note, so a relation touching it would
  // silently attach to the wrong one — drop the relation, keep both notes.
  const usableKey = (key?: string | null) => Boolean(key && seen.get(key) === 1);

  const notesWithValidParents = notes.map((note) => {
    const key = note.parentClientKey;
    if (!key || key === note.clientKey) return { ...note, parentClientKey: null };
    if (seen.has(key) && !usableKey(key)) return { ...note, parentClientKey: null };
    return note;
  });

  const relations = ((parsed.relations ?? []) as ExtractedRelation[]).filter(
    (rel) => usableKey(rel.from) && usableKey(rel.to) && rel.from !== rel.to
  );

  return {
    notes: notesWithValidParents,
    relations,
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
