import { NoteNotFoundError, TranscriptNotFoundError } from '../domain/errors.js';
import { parseWrittenNote } from '../domain/extraction.js';
import type {
  AiActionRepositoryPort,
  AiChatProviderPort,
  AiCreditsPort,
  AiKeyResolverPort,
  AiNotePort,
  AiRecordingPort,
  AiTranscriptPort,
  AiUnitOfWorkPort,
  AiUserProfilePort,
} from '../domain/ports.js';
import {
  buildWriteNotePrompt,
  WRITE_NOTE_SYSTEM,
  WRITE_NOTE_VERSION,
} from '../domain/prompts/writeNote.js';
import { ResolveModelUseCase } from './resolveModel.js';

const BASE_WRITE_CREDITS = 4;
const USD_PER_CREDIT = 0.01 / 10;

export interface WriteNoteInput {
  userId: string;
  transcriptId: string;
  noteId: string;
  recordingId?: string | null;
}

export interface WriteNoteResult {
  noteId: string;
  changed: boolean;
  creditsCharged: number;
}

export interface WriteNoteDependencies {
  actionRepo: AiActionRepositoryPort;
  resolveModelUseCase: ResolveModelUseCase;
  keyResolver: AiKeyResolverPort;
  chatProvider: AiChatProviderPort;
  creditsPort: AiCreditsPort;
  notePort: AiNotePort;
  transcriptPort: AiTranscriptPort;
  recordingPort: AiRecordingPort;
  userProfilePort: AiUserProfilePort;
  unitOfWork: AiUnitOfWorkPort;
}

export class WriteNoteUseCase {
  private readonly actionRepo: AiActionRepositoryPort;
  private readonly resolveModelUseCase: ResolveModelUseCase;
  private readonly keyResolver: AiKeyResolverPort;
  private readonly chatProvider: AiChatProviderPort;
  private readonly creditsPort: AiCreditsPort;
  private readonly notePort: AiNotePort;
  private readonly transcriptPort: AiTranscriptPort;
  private readonly recordingPort: AiRecordingPort;
  private readonly userProfilePort: AiUserProfilePort;
  private readonly unitOfWork: AiUnitOfWorkPort;

  constructor(deps: WriteNoteDependencies) {
    this.actionRepo = deps.actionRepo;
    this.resolveModelUseCase = deps.resolveModelUseCase;
    this.keyResolver = deps.keyResolver;
    this.chatProvider = deps.chatProvider;
    this.creditsPort = deps.creditsPort;
    this.notePort = deps.notePort;
    this.transcriptPort = deps.transcriptPort;
    this.recordingPort = deps.recordingPort;
    this.userProfilePort = deps.userProfilePort;
    this.unitOfWork = deps.unitOfWork;
  }

  async execute(input: WriteNoteInput): Promise<WriteNoteResult> {
    const { userId, transcriptId, noteId, recordingId } = input;

    // 1. Verify note and transcript belong to user BEFORE reserving credits
    const note = await this.notePort.getNoteById(noteId, userId);
    if (!note) {
      throw new NoteNotFoundError();
    }

    const transcript = await this.transcriptPort.findTranscript(transcriptId, userId);
    if (!transcript) {
      throw new TranscriptNotFoundError();
    }

    // 2. Resolve model and key
    const model = await this.resolveModelUseCase.execute(userId, 'chat');
    const { apiKey, usesPlatformKey } = await this.keyResolver.resolveKey(
      userId,
      model.provider,
      model.tier === 'byok_only'
    );

    // 3. Reserve credits if using platform key
    const estimated = Math.ceil(BASE_WRITE_CREDITS * Number(model.credit_multiplier));
    let reservationId: string | null = null;
    if (usesPlatformKey) {
      reservationId = await this.creditsPort.reserve(userId, estimated);
    }

    try {
      const tz = await this.userProfilePort.getUserTimezone(userId).catch(() => 'Africa/Cairo');
      const now = new Date();
      const safeZone = (fn: (zone: string) => string) => {
        try {
          return fn(tz);
        } catch {
          return fn('UTC');
        }
      };
      const clock = {
        today: safeZone((z) => new Intl.DateTimeFormat('en-CA', { timeZone: z }).format(now)),
        weekday: safeZone((z) =>
          new Intl.DateTimeFormat('en-US', { timeZone: z, weekday: 'long' }).format(now)
        ),
        timezone: tz,
      };

      const completion = await this.chatProvider.chat({
        apiKey,
        model: model.model_id,
        system: WRITE_NOTE_SYSTEM,
        user: buildWriteNotePrompt(
          transcript.text,
          { title: note.title, content: note.content },
          clock
        ),
        jsonMode: true,
        timeoutMs: 120_000,
      });

      const written = parseWrittenNote(completion.text);

      const rawCostUsd =
        (completion.inputTokens / 1_000_000) * Number(model.input_price_m ?? 0) +
        (completion.outputTokens / 1_000_000) * Number(model.output_price_m ?? 0);

      const calculatedActual = rawCostUsd
        ? Math.max(1, Math.ceil((rawCostUsd / USD_PER_CREDIT) * Number(model.credit_multiplier)))
        : estimated;

      const charged = usesPlatformKey ? Math.min(calculatedActual, estimated) : 0;
      const newText = written.content.trim();

      const result = await this.unitOfWork.runInTransaction(async (trx) => {
        // Status is 'accepted' for note writes (Closes M5)
        const actionId = await this.actionRepo.createAction(
          {
            userId,
            spaceId: (note as any).spaceId ?? (note as any).space_id ?? '',
            kind: 'extract_thoughts',
            status: 'accepted',
            recordingId: recordingId ?? transcript.recordingId ?? null,
            transcriptId: transcript.id,
            provider: model.provider,
            modelId: model.model_id,
            promptVersion: WRITE_NOTE_VERSION,
            billedTo: usesPlatformKey ? 'credits' : 'byok',
            creditsCharged: newText ? charged : 0,
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            rawCostUsd: rawCostUsd || null,
            rawResponse: { text: completion.text },
            error: null,
          },
          trx
        );

        if (!newText) {
          if (reservationId) {
            await this.creditsPort.settle(reservationId, userId, 0, actionId, trx);
            reservationId = null;
          }
          if (recordingId) {
            await this.recordingPort.updateRecordingStatus(recordingId, userId, 'completed', trx);
          }
          return { noteId, changed: false, creditsCharged: 0 };
        }

        const previous = note.content?.trim() ?? '';
        const isPlaceholder = !previous || previous === 'New note';
        const finalContent = isPlaceholder ? newText : `${previous}\n\n${newText}`;
        const finalTitle =
          note.title?.trim() && note.title !== 'New note' ? note.title : written.title ?? note.title;

        await this.notePort.updateNoteContent(
          noteId,
          userId,
          {
            content: finalContent,
            title: finalTitle,
            dueAt: written.dueAt ?? undefined,
          },
          trx
        );

        await this.actionRepo.createActionItems(
          [
            {
              userId,
              aiActionId: actionId,
              operation: 'update_note',
              targetType: 'sticky_note',
              targetId: noteId,
              forwardPatch: { content: finalContent, title: finalTitle, due_at: written.dueAt },
              inversePatch: { content: note.content, title: note.title },
              accepted: true,
              appliedAt: new Date(),
              sortOrder: 0,
            },
          ],
          trx
        );

        if (recordingId) {
          await this.recordingPort.updateRecordingStatus(recordingId, userId, 'completed', trx);
        }

        if (reservationId) {
          await this.creditsPort.settle(reservationId, userId, charged, actionId, trx);
          reservationId = null;
        }

        return { noteId, changed: true, creditsCharged: charged };
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
