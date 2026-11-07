import crypto from 'node:crypto';
import pLimit from 'p-limit';
import type {
  ExistingNoteContext,
  ExtractedNote,
  ExtractedRelation,
  Extraction,
  PromptClock,
  Rect,
} from '../domain/entities.js';
import {
  NoteNotFoundError,
  SpaceNotFoundError,
  TranscriptNotFoundError,
} from '../domain/errors.js';
import {
  colorForNote,
  MAX_MEETING_NOTES,
  MAX_NOTES,
  parseExtraction,
  resolveParentId,
} from '../domain/extraction.js';
import { layoutNewNotes, placeChild } from '../domain/layout.js';
import type {
  AiActionRepositoryPort,
  AiChatProviderPort,
  AiCreditsPort,
  AiKeyResolverPort,
  AiNotePort,
  AiRecordingPort,
  AiRelationshipPort,
  AiSpacePort,
  AiTranscriptPort,
  AiUnitOfWorkPort,
  AiUserProfilePort,
  NoteInsertRow,
  RelationshipInsertRow,
} from '../domain/ports.js';
import {
  buildExtractUserPrompt,
  EXTRACT_THOUGHTS_SYSTEM,
  EXTRACT_THOUGHTS_VERSION,
} from '../domain/prompts/extractThoughts.js';
import { ResolveModelUseCase } from './resolveModel.js';

const BASE_EXTRACT_CREDITS = 8;
const USD_PER_CREDIT = 0.01 / 10;
const MAX_CONTEXT_NOTES = 60;
const MAX_NOTE_CONTENT_CHARS = 400;
const LONG_TRANSCRIPT_SPLIT_CHARS = 12000;

export interface ExtractThoughtsInput {
  userId: string;
  transcriptId: string;
  spaceId: string;
  parentNoteId?: string | null;
  recordingId?: string | null;
  kind?: 'note' | 'meeting';
  processMode?: string | null;
}

export interface ExtractThoughtsResult {
  aiActionId: string;
  noteIds: string[];
  creditsCharged: number;
}

function buildClock(timezone: string): PromptClock {
  const now = new Date();
  const safeZone = (fn: (tz: string) => string) => {
    try {
      return fn(timezone);
    } catch {
      return fn('UTC');
    }
  };

  return {
    today: safeZone((tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)),
    weekday: safeZone((tz) =>
      new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now)
    ),
    timezone,
  };
}

export function splitOnSentenceBoundaries(text: string, maxChunkLength = LONG_TRANSCRIPT_SPLIT_CHARS): string[] {
  if (text.length <= maxChunkLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxChunkLength) {
    const window = remaining.slice(0, maxChunkLength);
    const matches = Array.from(window.matchAll(/[.?!؟۔\n]+(?:\s+|$)/g));
    let cutIndex = -1;

    if (matches.length > 0) {
      const lastMatch = matches[matches.length - 1];
      if (lastMatch.index !== undefined && lastMatch.index > 0) {
        cutIndex = lastMatch.index + lastMatch[0].length;
      }
    }

    if (cutIndex === -1 || cutIndex < maxChunkLength * 0.4) {
      const lastSpace = window.lastIndexOf(' ');
      if (lastSpace > maxChunkLength * 0.4) {
        cutIndex = lastSpace + 1;
      } else {
        cutIndex = maxChunkLength;
      }
    }

    chunks.push(remaining.slice(0, cutIndex).trim());
    remaining = remaining.slice(cutIndex).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks.filter((c) => c.length > 0);
}

export function mergeExtractedChunks(chunkExtractions: Extraction[], maxNotes: number): Extraction {
  const allNotes: ExtractedNote[] = [];
  const allRelations: ExtractedRelation[] = [];

  let noteCounter = 0;
  for (let c = 0; c < chunkExtractions.length; c++) {
    const { notes, relations } = chunkExtractions[c];
    const keyMap = new Map<string, string>();

    for (const note of notes) {
      const newKey = `note_${noteCounter++}`;
      keyMap.set(note.clientKey, newKey);
      allNotes.push({
        ...note,
        clientKey: newKey,
        parentClientKey: note.parentClientKey
          ? keyMap.get(note.parentClientKey) ?? note.parentClientKey
          : null,
      });
    }

    for (const rel of relations) {
      const mappedFrom = keyMap.get(rel.from) ?? rel.from;
      const mappedTo = keyMap.get(rel.to) ?? rel.to;
      allRelations.push({
        ...rel,
        from: mappedFrom,
        to: mappedTo,
      });
    }
  }

  const seenContent = new Set<string>();
  const deduplicatedNotes: ExtractedNote[] = [];

  for (const note of allNotes) {
    const norm = note.content.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (seenContent.has(norm)) {
      continue;
    }
    seenContent.add(norm);
    deduplicatedNotes.push(note);
    if (deduplicatedNotes.length >= maxNotes) {
      break;
    }
  }

  const survivingKeys = new Set(deduplicatedNotes.map((n) => n.clientKey));

  const notesWithCleanParents = deduplicatedNotes.map((note) => {
    if (note.parentClientKey && !survivingKeys.has(note.parentClientKey)) {
      return { ...note, parentClientKey: null };
    }
    return note;
  });

  const survivingRelations = allRelations.filter(
    (rel) => survivingKeys.has(rel.from) && survivingKeys.has(rel.to) && rel.from !== rel.to
  );

  return {
    notes: notesWithCleanParents,
    relations: survivingRelations,
  };
}

export interface ExtractThoughtsDependencies {
  actionRepo: AiActionRepositoryPort;
  resolveModelUseCase: ResolveModelUseCase;
  keyResolver: AiKeyResolverPort;
  chatProvider: AiChatProviderPort;
  creditsPort: AiCreditsPort;
  spacePort: AiSpacePort;
  notePort: AiNotePort;
  relationshipPort: AiRelationshipPort;
  transcriptPort: AiTranscriptPort;
  recordingPort: AiRecordingPort;
  userProfilePort: AiUserProfilePort;
  unitOfWork: AiUnitOfWorkPort;
  llmConcurrency?: number;
}

export class ExtractThoughtsUseCase {
  private readonly actionRepo: AiActionRepositoryPort;
  private readonly resolveModelUseCase: ResolveModelUseCase;
  private readonly keyResolver: AiKeyResolverPort;
  private readonly chatProvider: AiChatProviderPort;
  private readonly creditsPort: AiCreditsPort;
  private readonly spacePort: AiSpacePort;
  private readonly notePort: AiNotePort;
  private readonly relationshipPort: AiRelationshipPort;
  private readonly transcriptPort: AiTranscriptPort;
  private readonly recordingPort: AiRecordingPort;
  private readonly userProfilePort: AiUserProfilePort;
  private readonly unitOfWork: AiUnitOfWorkPort;
  private readonly llmConcurrency: number;

  constructor(deps: ExtractThoughtsDependencies) {
    this.actionRepo = deps.actionRepo;
    this.resolveModelUseCase = deps.resolveModelUseCase;
    this.keyResolver = deps.keyResolver;
    this.chatProvider = deps.chatProvider;
    this.creditsPort = deps.creditsPort;
    this.spacePort = deps.spacePort;
    this.notePort = deps.notePort;
    this.relationshipPort = deps.relationshipPort;
    this.transcriptPort = deps.transcriptPort;
    this.recordingPort = deps.recordingPort;
    this.userProfilePort = deps.userProfilePort;
    this.unitOfWork = deps.unitOfWork;
    this.llmConcurrency = deps.llmConcurrency ?? 16;
  }

  async execute(input: ExtractThoughtsInput): Promise<ExtractThoughtsResult> {
    const { userId, transcriptId, spaceId, parentNoteId, recordingId, kind } = input;

    // 0. Idempotency guard: if retrying a recording that already has an ai_actions row with notes, don't create more
    if (recordingId) {
      const existingAction = await this.actionRepo.findActionByRecording(recordingId, userId);
      if (existingAction) {
        const liveCount = await this.notePort.countLiveNotesForAction(existingAction.id, userId);
        if (liveCount > 0) {
          return {
            aiActionId: existingAction.id,
            noteIds: [],
            creditsCharged: existingAction.creditsCharged,
          };
        }
      }
    }

    // 1. Ownership verifications BEFORE reserving any credits (Closes H2)
    try {
      await this.spacePort.ensureOwned(spaceId, userId);
    } catch {
      throw new SpaceNotFoundError();
    }

    const transcript = await this.transcriptPort.findTranscript(transcriptId, userId);
    if (!transcript) {
      throw new TranscriptNotFoundError();
    }

    let focusNote: ExistingNoteContext | null = null;
    if (parentNoteId) {
      focusNote = await this.notePort.getNoteById(parentNoteId, userId);
      if (!focusNote) {
        throw new NoteNotFoundError('parent_note_not_found');
      }
    }

    // 2. Resolve model and API key
    const model = await this.resolveModelUseCase.execute(userId, 'chat');
    const { apiKey, usesPlatformKey } = await this.keyResolver.resolveKey(
      userId,
      model.provider,
      model.tier === 'byok_only'
    );

    // 3. Credit reservation (if platform key)
    const estimated = Math.ceil(BASE_EXTRACT_CREDITS * Number(model.credit_multiplier));
    let reservationId: string | null = null;
    if (usesPlatformKey) {
      reservationId = await this.creditsPort.reserve(userId, estimated);
    }

    try {
      // 4. Prompt context is capped at 60 notes, most recently updated first, content cut to 400 chars, always including focus note (Closes P1)
      const existingNotes = await this.notePort.listSpaceNotes(spaceId, userId);
      const sorted = [...existingNotes].sort((a, b) => {
        const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bt - at;
      });

      let contextNotes = sorted.slice(0, MAX_CONTEXT_NOTES);
      if (focusNote && !contextNotes.some((n) => n.id === focusNote.id)) {
        if (contextNotes.length >= MAX_CONTEXT_NOTES) {
          contextNotes = [focusNote, ...contextNotes.slice(0, MAX_CONTEXT_NOTES - 1)];
        } else {
          contextNotes = [focusNote, ...contextNotes];
        }
      }

      const boundedContext = contextNotes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content ? n.content.slice(0, MAX_NOTE_CONTENT_CHARS) : '',
        type: n.type,
      }));

      const tz = await this.userProfilePort.getUserTimezone(userId).catch(() => 'Africa/Cairo');
      const clock = buildClock(tz);

      const maxNotes = kind === 'meeting' ? MAX_MEETING_NOTES : MAX_NOTES;
      const transcriptText = transcript.text.trim();

      let extraction: Extraction;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let rawText = '';

      // 5. Long meeting splitting on sentence boundaries (> 12,000 chars)
      if (transcriptText.length > LONG_TRANSCRIPT_SPLIT_CHARS) {
        const chunks = splitOnSentenceBoundaries(transcriptText, LONG_TRANSCRIPT_SPLIT_CHARS);
        const limit = pLimit(this.llmConcurrency);

        const chunkResults = await Promise.all(
          chunks.map((chunk) =>
            limit(async () => {
              const res = await this.chatProvider.chat({
                apiKey,
                model: model.model_id,
                system: EXTRACT_THOUGHTS_SYSTEM,
                user: buildExtractUserPrompt(
                  chunk,
                  boundedContext,
                  focusNote
                    ? {
                        id: focusNote.id,
                        title: focusNote.title,
                        content: focusNote.content.slice(0, MAX_NOTE_CONTENT_CHARS),
                        type: focusNote.type,
                      }
                    : null,
                  clock
                ),
                jsonMode: true,
                timeoutMs: 120_000,
              });
              return res;
            })
          )
        );

        for (const res of chunkResults) {
          totalInputTokens += res.inputTokens;
          totalOutputTokens += res.outputTokens;
        }

        const chunkExtractions = chunkResults.map((r) => parseExtraction(r.text, maxNotes));
        extraction = mergeExtractedChunks(chunkExtractions, maxNotes);
        rawText = chunkResults.map((r) => r.text).join('\n---\n');
      } else {
        const completion = await this.chatProvider.chat({
          apiKey,
          model: model.model_id,
          system: EXTRACT_THOUGHTS_SYSTEM,
          user: buildExtractUserPrompt(
            transcriptText,
            boundedContext,
            focusNote
              ? {
                  id: focusNote.id,
                  title: focusNote.title,
                  content: focusNote.content.slice(0, MAX_NOTE_CONTENT_CHARS),
                  type: focusNote.type,
                }
              : null,
            clock
          ),
          jsonMode: true,
          timeoutMs: 120_000,
        });

        totalInputTokens = completion.inputTokens;
        totalOutputTokens = completion.outputTokens;
        rawText = completion.text;
        extraction = parseExtraction(completion.text, maxNotes);
      }

      // 6. Cost calculation and capping (Closes H6: charge never exceeds reservation)
      const rawCostUsd =
        (totalInputTokens / 1_000_000) * Number(model.input_price_m ?? 0) +
        (totalOutputTokens / 1_000_000) * Number(model.output_price_m ?? 0);

      const calculatedActual = rawCostUsd
        ? Math.max(1, Math.ceil((rawCostUsd / USD_PER_CREDIT) * Number(model.credit_multiplier)))
        : estimated;

      const charged = usesPlatformKey ? Math.min(calculatedActual, estimated) : 0;
      const finalCharge = extraction.notes.length === 0 ? 0 : charged;

      // 7. Commit notes, action, items, relationships, recording status, and credit settlement in ONE transaction
      const result = await this.unitOfWork.runInTransaction(async (trx) => {
        let targetSpaceId = spaceId;

        // Meeting recordings create their own space named with an AI title and the date
        if (kind === 'meeting') {
          const firstTitle = extraction.notes[0]?.title?.trim();
          const spaceName = firstTitle ? `${firstTitle} - ${clock.today}` : `Meeting - ${clock.today}`;
          const newSpace = await this.spacePort.createSpace(
            userId,
            { name: spaceName, emoji: '🎙️' },
            trx
          );
          targetSpaceId = newSpace.id;
        }

        const actionId = await this.actionRepo.createAction(
          {
            userId,
            spaceId: targetSpaceId,
            kind: 'extract_thoughts',
            status: 'proposed',
            recordingId: recordingId ?? transcript.recordingId ?? null,
            transcriptId: transcript.id,
            provider: model.provider,
            modelId: model.model_id,
            promptVersion: EXTRACT_THOUGHTS_VERSION,
            billedTo: usesPlatformKey ? 'credits' : 'byok',
            creditsCharged: finalCharge,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            rawCostUsd: rawCostUsd || null,
            rawResponse: { text: rawText },
            error: null,
          },
          trx
        );

        if (extraction.notes.length === 0) {
          if (reservationId) {
            await this.creditsPort.settle(reservationId, userId, 0, actionId, trx);
            reservationId = null;
          }
          if (recordingId) {
            await this.recordingPort.updateRecordingStatus(
              recordingId,
              userId,
              'completed',
              trx
            );
          }
          return { aiActionId: actionId, noteIds: [], creditsCharged: 0 };
        }

        const ids = extraction.notes.map(() => crypto.randomUUID());
        const clientKeyToIndex = new Map(extraction.notes.map((n, i) => [n.clientKey, i]));
        const clientKeyToId = new Map(extraction.notes.map((n, i) => [n.clientKey, ids[i]]));
        const existingIds = new Set(existingNotes.map((n) => n.id));

        const parentIds = extraction.notes.map((note, i) => {
          const resolved = resolveParentId(note, i, {
            batchIndex: clientKeyToIndex,
            batchIds: clientKeyToId,
            existingIds,
          });
          return resolved ?? focusNote?.id ?? null;
        });

        const existingTopLevel = existingNotes.filter((n) => !n.parentId);
        const topLevelIndices = parentIds
          .map((pId, i) => (pId === null ? i : -1))
          .filter((i) => i !== -1);

        const topLevelPositions = layoutNewNotes(
          topLevelIndices.length,
          existingTopLevel.map((n) => ({
            x: n.x ?? 0,
            y: n.y ?? 0,
            width: n.width ?? 190,
            height: n.height ?? 145,
          }))
        );

        const idToIndex = new Map(ids.map((id, i) => [id, i]));
        const rectByIndex = new Map<number, Rect>();
        topLevelIndices.forEach((i, slot) => rectByIndex.set(i, topLevelPositions[slot]));

        const siblingCountByParent = new Map<string, number>();
        for (let i = 0; i < extraction.notes.length; i++) {
          if (rectByIndex.has(i)) continue;
          const parentId = parentIds[i]!;
          const siblingIndex = siblingCountByParent.get(parentId) ?? 0;
          siblingCountByParent.set(parentId, siblingIndex + 1);

          const parentRect: Rect = existingIds.has(parentId)
            ? (() => {
                const found = existingNotes.find((n) => n.id === parentId)!;
                return {
                  x: found.x ?? 0,
                  y: found.y ?? 0,
                  width: found.width ?? 190,
                  height: found.height ?? 145,
                };
              })()
            : rectByIndex.get(idToIndex.get(parentId as any)!)!;

          const occupied: Rect[] = [
            ...existingNotes.map((n) => ({
              x: n.x ?? 0,
              y: n.y ?? 0,
              width: n.width ?? 190,
              height: n.height ?? 145,
            })),
            ...rectByIndex.values(),
          ];

          rectByIndex.set(i, placeChild(parentRect, siblingIndex, occupied));
        }

        const noteRows: NoteInsertRow[] = extraction.notes.map((note, i) => {
          const rect = rectByIndex.get(i)!;
          return {
            id: ids[i],
            userId,
            spaceId: targetSpaceId,
            title: note.title ?? null,
            content: note.content,
            type: note.type,
            color: colorForNote(note.type, note.color),
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            parentId: parentIds[i],
            dueAt: note.dueAt ?? null,
            sourceType: 'ai',
            recordingId: recordingId ?? transcript.recordingId ?? null,
            transcriptId: transcript.id,
            spanStart: note.spanStart ?? null,
            spanEnd: note.spanEnd ?? null,
            aiActionId: actionId,
          };
        });

        const insertedNotes = await this.notePort.insertNotes(noteRows, trx);

        // Action items for undo
        await this.actionRepo.createActionItems(
          insertedNotes.map((row, i) => ({
            userId,
            aiActionId: actionId,
            operation: 'create_note',
            targetType: 'sticky_note',
            targetId: row.id,
            forwardPatch: noteRows[i] as unknown as Record<string, unknown>,
            inversePatch: { id: row.id, deleted_at: 'now()' },
            accepted: true,
            appliedAt: new Date(),
            sortOrder: i,
          })),
          trx
        );

        // Insert relationships if any
        if (extraction.relations.length > 0) {
          const relRows: RelationshipInsertRow[] = extraction.relations.map((rel) => {
            const fromIndex = clientKeyToIndex.get(rel.from)!;
            const toIndex = clientKeyToIndex.get(rel.to)!;
            return {
              userId,
              spaceId: targetSpaceId,
              fromNoteId: ids[fromIndex],
              toNoteId: ids[toIndex],
              type: rel.type,
              createdBy: 'ai',
              aiActionId: actionId,
            };
          });
          await this.relationshipPort.insertRelationships(relRows, trx);
        }

        await this.spacePort.bumpActivity(targetSpaceId, insertedNotes.length, trx);

        if (recordingId) {
          await this.recordingPort.updateRecordingStatus(
            recordingId,
            userId,
            'completed',
            trx
          );
        }

        if (reservationId) {
          await this.creditsPort.settle(reservationId, userId, finalCharge, actionId, trx);
          reservationId = null;
        }

        return {
          aiActionId: actionId,
          noteIds: ids,
          creditsCharged: finalCharge,
        };
      });

      return result;
    } catch (err) {
      if (reservationId) {
        await this.creditsPort.release(reservationId, userId).catch(() => {});
        reservationId = null;
      }
      throw err;
    }
  }
}
