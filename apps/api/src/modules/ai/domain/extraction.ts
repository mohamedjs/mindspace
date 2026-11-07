import * as yup from 'yup';
import type { ExtractedNote, ExtractedRelation, Extraction, WrittenNote } from './entities.js';

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
  type: keyof typeof NOTE_COLORS | string,
  proposed?: string | null
): string {
  const fallback = NOTE_COLORS[type as keyof typeof NOTE_COLORS] ?? NOTE_COLORS.idea;
  return proposed && HEX.test(proposed) ? proposed : fallback;
}

export const MAX_NOTES = 8;
export const MAX_MEETING_NOTES = 40;

const ISO_OFFSET_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function sanitizeDueAt(originalValue: unknown): string | null {
  if (!originalValue || typeof originalValue !== 'string') return null;
  const trimmed = originalValue.trim();
  if (!ISO_OFFSET_REGEX.test(trimmed)) return null;
  const time = Date.parse(trimmed);
  if (Number.isNaN(time)) return null;
  return trimmed;
}

export const extractedNoteSchema = yup.object({
  clientKey: yup.string().required(),
  title: yup.string().max(80).nullable().optional(),
  content: yup.string().min(1).required(),
  type: yup
    .string()
    .transform((value, originalValue) => {
      if (typeof originalValue === 'string' && NOTE_TYPES.includes(originalValue as any)) {
        return originalValue;
      }
      return 'idea';
    })
    .default('idea'),
  parentClientKey: yup.string().nullable().optional(),
  dueAt: yup
    .string()
    .nullable()
    .optional()
    .transform((value, originalValue) => sanitizeDueAt(originalValue))
    .default(null),
  spanStart: yup.number().integer().min(0).nullable().optional(),
  spanEnd: yup.number().integer().min(0).nullable().optional(),
  color: yup.string().nullable().optional(),
});

export const extractedRelationSchema = yup.object({
  from: yup.string().required(),
  to: yup.string().required(),
  type: yup
    .string()
    .transform((value, originalValue) => {
      if (typeof originalValue === 'string' && REL_TYPES.includes(originalValue as any)) {
        return originalValue;
      }
      return 'related';
    })
    .default('related'),
});

export const extractionSchema = yup.object({
  notes: yup.array().of(extractedNoteSchema).required(),
  relations: yup.array().of(extractedRelationSchema).default([]),
});

export const writtenNoteSchema = yup.object({
  title: yup.string().max(80).nullable().optional(),
  content: yup.string().default(''),
  dueAt: yup
    .string()
    .nullable()
    .optional()
    .transform((value, originalValue) => sanitizeDueAt(originalValue))
    .default(null),
});

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

export function parseExtraction(raw: string, maxNotes = MAX_NOTES): Extraction {
  const jsonBlock = extractJsonBlock(raw);
  const parsedJson = JSON.parse(jsonBlock);

  if (!parsedJson || typeof parsedJson !== 'object' || !('notes' in parsedJson)) {
    throw new Error('invalid_extraction: notes field is required');
  }

  const parsed = extractionSchema.validateSync(parsedJson, { stripUnknown: true });
  const rawNotes = (parsed.notes ?? []) as ExtractedNote[];
  const notes = rawNotes.slice(0, maxNotes);

  const seen = new Map<string, number>();
  for (const note of notes) {
    seen.set(note.clientKey, (seen.get(note.clientKey) ?? 0) + 1);
  }
  const usableKey = (key: string) => seen.get(key) === 1;

  const notesWithValidParents = notes.map((note) => {
    const key = note.parentClientKey;
    if (!key || key === note.clientKey) return { ...note, parentClientKey: null };
    if (seen.has(key) && !usableKey(key)) return { ...note, parentClientKey: null };
    return note;
  });

  const validRelations = ((parsed.relations ?? []) as ExtractedRelation[]).filter(
    (rel) => usableKey(rel.from) && usableKey(rel.to) && rel.from !== rel.to
  );

  return {
    notes: notesWithValidParents,
    relations: validRelations,
  };
}

export function parseWrittenNote(raw: string): WrittenNote {
  const jsonBlock = extractJsonBlock(raw);
  const parsedJson = JSON.parse(jsonBlock);
  const parsed = writtenNoteSchema.validateSync(parsedJson, { stripUnknown: true });
  return {
    title: parsed.title ?? null,
    content: (parsed.content ?? '').trim(),
    dueAt: parsed.dueAt ?? null,
  };
}

export interface ParentResolutionContext {
  batchIndex: Map<string, number>;
  batchIds: Map<string, string>;
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
