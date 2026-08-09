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

const extractedNoteSchema = z.object({
  clientKey: z.string(),
  title: z.string().max(80).nullable().optional(),
  content: z.string().min(1),
  type: z.enum(NOTE_TYPES).catch('idea'),
  color: z.string().nullable().optional(),
  spanStart: z.number().int().nonnegative().nullable().optional(),
  spanEnd: z.number().int().nonnegative().nullable().optional(),
});

const extractedRelationSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(REL_TYPES).catch('related'),
});

/**
 * Canonical paper colour per note type — mirrors noteColors in
 * src/shared/constants/tokens.ts. Colour is fully derivable from type, so the
 * model is told to omit it; this is the fallback the server applies.
 */
export const NOTE_COLORS: Record<(typeof NOTE_TYPES)[number], string> = {
  idea: '#FFF8BC',
  task: '#C8E6C9',
  question: '#BBDEFB',
  decision: '#F8BBD0',
  reference: '#E1BEE7',
  thought: '#FFE0B2',
  summary: '#B2EBF2',
};

/** Only accept a colour the UI can actually render. */
const HEX = /^#[0-9a-fA-F]{6}$/;

export function colorForNote(type: keyof typeof NOTE_COLORS, proposed?: string | null): string {
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

export type Extraction = z.infer<typeof extractionSchema>;

/**
 * Models wrap JSON in prose or fences even in JSON mode. Pull the first
 * balanced {...} block rather than trusting the whole reply to parse.
 *
 * Mirrors src/features/ai/schemas/extraction.ts, which carries the unit tests.
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

  return candidate.slice(start);
}

export function parseExtraction(raw: string): Extraction {
  const parsed = extractionSchema.parse(JSON.parse(extractJsonBlock(raw)));

  const notes = parsed.notes.slice(0, MAX_NOTES);

  const seen = new Map<string, number>();
  for (const note of notes) seen.set(note.clientKey, (seen.get(note.clientKey) ?? 0) + 1);
  // A key used twice cannot identify a note, so relations touching it would
  // silently attach to the wrong one.
  const usableKey = (key: string) => seen.get(key) === 1;

  return {
    notes,
    relations: parsed.relations.filter(
      (rel) => usableKey(rel.from) && usableKey(rel.to) && rel.from !== rel.to
    ),
  };
}
