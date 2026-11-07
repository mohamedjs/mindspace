import pLimit, { type LimitFunction } from 'p-limit';
import type { AllowedAudioExtension, Recording, RecordingPart } from '../domain/entities.js';
import {
  AiNotInPlanError,
  RecordingCapExceededError,
  RecordingNotUploadedError,
} from '../domain/errors.js';
import type {
  AudioMediaPort,
  BlobStorePort,
  CreditsReservationPort,
  EntitlementsPort,
  ExtractorPort,
  KeyResolverPort,
  RecordingEventsPort,
  RecordingRepositoryPort,
  TranscribeModelResolverPort,
  TranscriberPort,
} from '../domain/ports.js';

const CREDITS_PER_MINUTE = 6;
const DEFAULT_SPLIT_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_IDLE_SWEEP_MS = 15 * 60 * 1000; // 15 minutes

export interface ProcessRecordingJobDependencies {
  recordingRepo: RecordingRepositoryPort;
  blobStore: BlobStorePort;
  audioMedia: AudioMediaPort;
  transcriber: TranscriberPort;
  modelResolver: TranscribeModelResolverPort;
  keyResolver: KeyResolverPort;
  creditsPort: CreditsReservationPort;
  entitlements: EntitlementsPort;
  extractor: ExtractorPort;
  eventsPort: RecordingEventsPort;
  sttConcurrency?: number;
  splitThresholdMs?: number;
  maxAttempts?: number;
  idleSweepMs?: number;
}

export class ProcessRecordingJobUseCase {
  private readonly recordingRepo: RecordingRepositoryPort;
  private readonly blobStore: BlobStorePort;
  private readonly audioMedia: AudioMediaPort;
  private readonly transcriber: TranscriberPort;
  private readonly modelResolver: TranscribeModelResolverPort;
  private readonly keyResolver: KeyResolverPort;
  private readonly creditsPort: CreditsReservationPort;
  private readonly entitlements: EntitlementsPort;
  private readonly extractor: ExtractorPort;
  private readonly eventsPort: RecordingEventsPort;
  private readonly sttLimit: LimitFunction;
  private readonly splitThresholdMs: number;
  private readonly maxAttempts: number;
  private readonly idleSweepMs: number;

  constructor(deps: ProcessRecordingJobDependencies) {
    this.recordingRepo = deps.recordingRepo;
    this.blobStore = deps.blobStore;
    this.audioMedia = deps.audioMedia;
    this.transcriber = deps.transcriber;
    this.modelResolver = deps.modelResolver;
    this.keyResolver = deps.keyResolver;
    this.creditsPort = deps.creditsPort;
    this.entitlements = deps.entitlements;
    this.extractor = deps.extractor;
    this.eventsPort = deps.eventsPort;
    this.sttLimit = pLimit(deps.sttConcurrency ?? 16);
    this.splitThresholdMs = deps.splitThresholdMs ?? DEFAULT_SPLIT_THRESHOLD_MS;
    this.maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.idleSweepMs = deps.idleSweepMs ?? DEFAULT_IDLE_SWEEP_MS;
  }

  async claimAndProcessNext(signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;

    const claimed = await this.recordingRepo.claimNextQueued();
    if (!claimed) {
      return false;
    }

    await this.eventsPort.publishStatus(claimed.id, {
      status: 'transcribing',
      error: null,
    });

    await this.processClaimedRecording(claimed, signal);
    return true;
  }

  async processClaimedRecording(recording: Recording, signal?: AbortSignal): Promise<void> {
    let reservationId: string | null = null;

    try {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Worker aborted');
      }

      // 0. If transcript already exists from an earlier attempt before extraction finished,
      // skip re-transcribing and hand off directly to Extractor.
      const existingTranscript = await this.recordingRepo.findTranscriptByRecording(
        recording.id,
        recording.userId
      );
      if (existingTranscript) {
        await this.recordingRepo.updateStatus(recording.id, recording.userId, 'extracting', null);
        await this.eventsPort.publishStatus(recording.id, { status: 'extracting', error: null });

        await this.extractor.extract({
          recordingId: recording.id,
          userId: recording.userId,
          spaceId: recording.spaceId,
          transcriptId: existingTranscript.id,
          transcriptText: existingTranscript.text,
          kind: recording.kind,
          processMode: recording.processMode,
          targetNoteId: recording.targetNoteId,
          parentNoteId: recording.parentNoteId,
        });
        return;
      }

      // 1. Check plan AI entitlement before probing/processing
      const userEntitlements = await this.entitlements.getEntitlements(recording.userId);
      if (!userEntitlements.aiEnabled) {
        throw new AiNotInPlanError();
      }

      // 2. Load parts and ffprobe every part for real duration
      let parts = await this.recordingRepo.listParts(recording.id, recording.userId);
      if (parts.length === 0) {
        throw new RecordingNotUploadedError();
      }

      for (const part of parts) {
        if (signal?.aborted) {
          throw signal.reason ?? new Error('Worker aborted');
        }
        if (part.durationMs === null || part.durationMs <= 0) {
          const measuredMs = await this.audioMedia.probeDurationMs(part.blobKey);
          await this.recordingRepo.updatePartDuration(part.id, recording.userId, measuredMs);
          part.durationMs = measuredMs;
        }
      }

      const totalDurationMs = parts.reduce((sum, p) => sum + (p.durationMs ?? 0), 0);
      await this.recordingRepo.updateRecordingDuration(
        recording.id,
        recording.userId,
        totalDurationMs
      );

      // 3. Enforce recording duration cap from plan entitlements
      if (
        userEntitlements.maxRecordingMinutes !== null &&
        totalDurationMs > userEntitlements.maxRecordingMinutes * 60_000
      ) {
        throw new RecordingCapExceededError(userEntitlements.maxRecordingMinutes);
      }

      // 3. Split any part over splitThresholdMs (default 5 minutes) with ffmpeg into new parts
      const needsSplit = parts.some(
        (p) => p.status !== 'transcribed' && (p.durationMs ?? 0) > this.splitThresholdMs
      );

      if (needsSplit) {
        await this.recordingRepo.updateStatus(recording.id, recording.userId, 'splitting', null);
        await this.eventsPort.publishStatus(recording.id, { status: 'splitting', error: null });

        parts = await this.splitOversizedParts(recording, parts, signal);

        await this.recordingRepo.updateStatus(recording.id, recording.userId, 'transcribing', null);
        await this.eventsPort.publishStatus(recording.id, { status: 'transcribing', error: null });
      }

      // 4. Resolve transcription model and API key
      const model = await this.modelResolver.resolveTranscribeModel(recording.userId);
      const resolvedKey = await this.keyResolver.resolveKey(
        recording.userId,
        model.provider,
        model.byokOnly
      );

      // 5. Reserve credits from server-measured duration: 6 per minute * multiplier
      const minutes = totalDurationMs / 60_000;
      const estimatedCredits = Math.max(
        1,
        Math.ceil(CREDITS_PER_MINUTE * minutes * Number(model.creditMultiplier))
      );

      // Release any stale held reservation from a prior crashed attempt on this recording
      const staleReservationIds = await this.recordingRepo.findHeldReservationsForRecording(
        recording.id,
        recording.userId
      );
      for (const staleId of staleReservationIds) {
        await this.creditsPort.release(staleId, recording.userId).catch(() => {});
      }

      if (resolvedKey.usesPlatformKey && estimatedCredits > 0) {
        reservationId = await this.creditsPort.reserve(recording.userId, estimatedCredits);
        await this.recordingRepo.tagReservationForRecording(
          reservationId,
          recording.userId,
          recording.id
        );
      }

      // 6. Transcribe pending parts with p-limit(STT_CONCURRENCY), saving each as it finishes
      const pendingParts = parts.filter(
        (p) => p.status !== 'transcribed' || p.transcriptText === null
      );

      let detectedLanguage: string | null = null;

      await Promise.all(
        pendingParts.map((part) =>
          this.sttLimit(async () => {
            if (signal?.aborted) {
              throw signal.reason ?? new Error('Worker aborted');
            }

            const format = (part.blobKey.split('.').pop() || 'webm').toLowerCase();
            const audioStream = this.blobStore.createReadStream(part.blobKey);

            const result = await this.transcriber.transcribe({
              apiKey: resolvedKey.apiKey,
              model: model.modelId,
              provider: model.provider,
              baseUrl: resolvedKey.baseUrl,
              audioStream,
              format,
              partIdx: part.idx,
              recordingId: recording.id,
              blobKey: part.blobKey,
              signal,
            });

            if (signal?.aborted) {
              throw signal.reason ?? new Error('Worker aborted');
            }

            if (result.language && !detectedLanguage) {
              detectedLanguage = result.language;
            }

            await this.recordingRepo.markPartTranscribed(part.id, recording.userId, result.text);
            part.status = 'transcribed';
            part.transcriptText = result.text;
          })
        )
      );

      if (signal?.aborted) {
        throw signal.reason ?? new Error('Worker aborted');
      }

      // 7. Join by idx into transcripts and settle in the same transaction
      const refreshedParts = await this.recordingRepo.listParts(recording.id, recording.userId);
      const sortedParts = [...refreshedParts].sort((a, b) => a.idx - b.idx);
      const joinedText = sortedParts
        .map((p) => (p.transcriptText ?? '').trim())
        .filter((t) => t.length > 0)
        .join(' ');

      const transcript = await this.recordingRepo.saveTranscriptAndSettle({
        recordingId: recording.id,
        userId: recording.userId,
        text: joinedText,
        language: detectedLanguage,
        provider: model.provider,
        modelId: model.modelId,
        durationMs: totalDurationMs,
        reservationId,
        estimatedCredits,
        creditsPort: this.creditsPort,
      });

      // Reservation is now settled inside the transaction
      reservationId = null;

      await this.eventsPort.publishStatus(recording.id, { status: 'extracting', error: null });

      // 8. Audio retention follows the existing free-plan rule, removed after transcript is saved
      const isFreePlan =
        userEntitlements.isFreePlan ??
        (await this.recordingRepo.isFreePlanUser(recording.userId));

      if (isFreePlan) {
        await this.blobStore.deleteRecordingFiles(recording.userId, recording.id).catch(() => {});
        await this.recordingRepo.markAudioRemovedForFreePlan(recording.id, recording.userId);
      }

      // 9. Hand off through Extractor port (no-op until phase 06)
      await this.extractor.extract({
        recordingId: recording.id,
        userId: recording.userId,
        spaceId: recording.spaceId,
        transcriptId: transcript.id,
        transcriptText: transcript.text,
        kind: recording.kind,
        processMode: recording.processMode,
        targetNoteId: recording.targetNoteId,
        parentNoteId: recording.parentNoteId,
      });
    } catch (err: any) {
      // If the worker was killed/aborted mid-job, leave the claimed state intact
      // so the sweeper requeues (or fails after 3 attempts) without losing saved parts.
      if (signal?.aborted) {
        return;
      }

      if (reservationId) {
        await this.creditsPort.release(reservationId, recording.userId).catch(() => {});
        reservationId = null;
      }

      const errorCode =
        typeof err?.code === 'string'
          ? err.code
          : err instanceof Error
            ? err.message
            : 'internal_error';

      await this.recordingRepo
        .updateStatus(recording.id, recording.userId, 'failed', errorCode, true)
        .catch(() => {});

      await this.eventsPort
        .publishStatus(recording.id, { status: 'failed', error: errorCode })
        .catch(() => {});
    }
  }

  private async splitOversizedParts(
    recording: Recording,
    parts: RecordingPart[],
    signal?: AbortSignal
  ): Promise<RecordingPart[]> {
    const segmentSeconds = Math.max(1, Math.floor(this.splitThresholdMs / 1000));

    interface StagedPart {
      tempFilePath: string;
      ext: AllowedAudioExtension;
      durationMs: number;
      status: string;
      transcriptText: string | null;
      attempts: number;
    }

    const staged: StagedPart[] = [];
    const oldKeysToDelete: string[] = [];

    for (const part of parts) {
      if (signal?.aborted) {
        throw signal.reason ?? new Error('Worker aborted');
      }

      const ext = (part.blobKey.split('.').pop() || 'webm') as AllowedAudioExtension;

      if (part.status !== 'transcribed' && (part.durationMs ?? 0) > this.splitThresholdMs) {
        const chunks = await this.audioMedia.splitPart({
          userId: recording.userId,
          recordingId: recording.id,
          part,
          segmentSeconds,
        });
        oldKeysToDelete.push(part.blobKey);
        for (const chunk of chunks) {
          staged.push({
            tempFilePath: chunk.tempFilePath,
            ext: chunk.ext,
            durationMs: chunk.durationMs,
            status: 'uploaded',
            transcriptText: null,
            attempts: 0,
          });
        }
      } else {
        const tempFilePath = await this.audioMedia.stagePartToTemp(part.blobKey);
        staged.push({
          tempFilePath,
          ext,
          durationMs: part.durationMs ?? 0,
          status: part.status,
          transcriptText: part.transcriptText,
          attempts: part.attempts,
        });
      }
    }

    // Delete original oversized files before placing split chunks at 0..N
    for (const key of oldKeysToDelete) {
      await this.blobStore.delete(key).catch(() => {});
    }

    const finalEntries: Array<{
      idx: number;
      blobKey: string;
      durationMs: number;
      status: string;
      transcriptText: string | null;
      attempts: number;
    }> = [];

    for (let newIdx = 0; newIdx < staged.length; newIdx++) {
      const item = staged[newIdx];
      const blobKey = await this.audioMedia.moveSplitChunk(
        item.tempFilePath,
        recording.userId,
        recording.id,
        newIdx,
        item.ext
      );

      finalEntries.push({
        idx: newIdx,
        blobKey,
        durationMs: item.durationMs,
        status: item.status,
        transcriptText: item.transcriptText,
        attempts: item.attempts,
      });
    }

    return this.recordingRepo.replacePartsAfterSplit(
      recording.id,
      recording.userId,
      finalEntries
    );
  }

  async sweepStaleJobs(idleThresholdMs = this.idleSweepMs): Promise<{
    requeued: number;
    failed: number;
  }> {
    const staleRecordings = await this.recordingRepo.findStaleClaimedRecordings(idleThresholdMs);
    let requeued = 0;
    let failed = 0;

    for (const rec of staleRecordings) {
      // Release any held reservations associated with this recording
      const heldIds = await this.recordingRepo.findHeldReservationsForRecording(
        rec.id,
        rec.userId
      );
      for (const resId of heldIds) {
        await this.creditsPort.release(resId, rec.userId).catch(() => {});
      }

      if (rec.attempts >= this.maxAttempts) {
        await this.recordingRepo.failStaleRecording(
          rec.id,
          rec.userId,
          'max_attempts_exceeded'
        );
        await this.eventsPort
          .publishStatus(rec.id, { status: 'failed', error: 'max_attempts_exceeded' })
          .catch(() => {});
        failed++;
      } else {
        await this.recordingRepo.requeueStaleRecording(rec.id, rec.userId);
        await this.eventsPort
          .publishStatus(rec.id, { status: 'queued', error: null })
          .catch(() => {});
        await this.eventsPort.publishWake().catch(() => {});
        requeued++;
      }
    }

    return { requeued, failed };
  }

  async sweepUnfinishedRecordings(
    maxAgeMs = 24 * 60 * 60 * 1000,
    tx?: unknown
  ): Promise<{ sweptRecordings: number; deletedParts: number }> {
    const stale = await this.recordingRepo.findUnfinishedRecordingsOlderThan(maxAgeMs, tx);
    let sweptRecordings = 0;
    let deletedParts = 0;

    for (const rec of stale) {
      await this.blobStore.deleteRecordingFiles(rec.userId, rec.id).catch(() => {});
      const deleted = await this.recordingRepo.deleteRecordingParts(rec.id, rec.userId, tx);
      sweptRecordings++;
      deletedParts += deleted;
    }

    return { sweptRecordings, deletedParts };
  }
}
