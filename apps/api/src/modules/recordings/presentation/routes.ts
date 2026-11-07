import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createRecordingRequestSchema,
  markRecordingFailedRequestSchema,
} from '@mindspace/contracts';
import {
  currentUserId,
  requireUser,
  type RequireUserHook,
} from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import type { RecordingStatus, RecordingStatusEvent } from '../domain/entities.js';
import {
  AiNotInPlanError,
  AudioPartIndexExceededError,
  AudioPartTooLargeError,
  AudioStorageQuotaExceededError,
  InvalidAudioContainerError,
  NoteNotFoundForRecordingError,
  RecordingNotFoundError,
  SpaceNotFoundForRecordingError,
} from '../domain/errors.js';
import type { RecordingEventsPort } from '../domain/ports.js';
import type {
  CreateRecordingUseCase,
  FinishRecordingUseCase,
  GetRecordingStatusUseCase,
  GetTranscriptIdUseCase,
  ListRecordingsUseCase,
  MarkRecordingCompletedUseCase,
  MarkRecordingFailedUseCase,
  UploadRecordingPartUseCase,
} from '../application/index.js';

export interface RecordingRoutesDependencies {
  requireUser?: RequireUserHook;
  createRecordingUseCase: CreateRecordingUseCase;
  uploadRecordingPartUseCase: UploadRecordingPartUseCase;
  finishRecordingUseCase: FinishRecordingUseCase;
  listRecordingsUseCase: ListRecordingsUseCase;
  getRecordingStatusUseCase: GetRecordingStatusUseCase;
  getTranscriptIdUseCase: GetTranscriptIdUseCase;
  markRecordingFailedUseCase: MarkRecordingFailedUseCase;
  markRecordingCompletedUseCase: MarkRecordingCompletedUseCase;
  eventsPort: RecordingEventsPort;
  sseHeartbeatMs?: number;
  ssePollIntervalMs?: number;
  maxPartBytes?: number;
}

function isTerminalStatus(status: RecordingStatus): boolean {
  return status === 'completed' || status === 'failed';
}

export function registerRecordingRoutes(
  app: FastifyInstance,
  deps: RecordingRoutesDependencies
): void {
  const authHook = deps.requireUser || requireUser;
  const heartbeatMs = deps.sseHeartbeatMs ?? 20_000;
  const pollIntervalMs = deps.ssePollIntervalMs ?? 2_000;

  // 1. POST /spaces/:space_id/recordings
  app.post(
    '/spaces/:space_id/recordings',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      const validated = await createRecordingRequestSchema.validate(req.body ?? {}, {
        abortEarly: false,
        stripUnknown: true,
      });

      const processMode = validated.processMode ?? validated.process_mode ?? 'extract';
      const targetNoteId = validated.targetNoteId ?? validated.target_note_id ?? null;
      const parentNoteId = validated.parentNoteId ?? validated.parent_note_id ?? null;

      try {
        const recording = await deps.createRecordingUseCase.execute({
          userId,
          spaceId,
          kind: validated.kind ?? 'note',
          processMode,
          targetNoteId,
          parentNoteId,
        });

        return reply.status(201).send({
          id: recording.id,
          space_id: recording.spaceId,
          status: recording.status,
          kind: recording.kind,
          process_mode: recording.processMode,
          target_note_id: recording.targetNoteId,
          parent_note_id: recording.parentNoteId,
          duration_ms: recording.durationMs,
          created_at: recording.createdAt,
        });
      } catch (err: any) {
        if (
          err instanceof SpaceNotFoundForRecordingError ||
          err?.name === 'SpaceNotFoundError'
        ) {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        if (
          err instanceof NoteNotFoundForRecordingError ||
          err?.name === 'NoteNotFoundError'
        ) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // 2. GET /spaces/:space_id/recordings
  app.get(
    '/spaces/:space_id/recordings',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        const recordings = await deps.listRecordingsUseCase.execute(userId, spaceId);
        return reply.status(200).send(recordings);
      } catch (err: any) {
        if (
          err instanceof SpaceNotFoundForRecordingError ||
          err?.name === 'SpaceNotFoundError'
        ) {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // 3. PUT /recordings/:id/parts/:idx (streamed binary upload, magic-byte verified)
  app.register(async (uploadScope) => {
    uploadScope.removeAllContentTypeParsers();
    uploadScope.addContentTypeParser('*', (_req, payload, done) => {
      done(null, payload);
    });

    uploadScope.put(
      '/recordings/:id/parts/:idx',
      { preHandler: [authHook] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = currentUserId(req);
        const params = req.params as { id: string; idx: string };
        const recordingId = params.id;

        if (!/^\d+$/.test(params.idx)) {
          throw new AppError(
            'validation_error',
            422,
            'Part idx must be a non-negative integer'
          );
        }
        const idx = Number.parseInt(params.idx, 10);

        const rawBody = req.body as unknown;
        let stream: Readable;
        if (rawBody && typeof (rawBody as Readable).pipe === 'function') {
          stream = rawBody as Readable;
        } else if (Buffer.isBuffer(rawBody) || rawBody instanceof Uint8Array) {
          stream = Readable.from([Buffer.from(rawBody)]);
        } else if (typeof rawBody === 'string') {
          stream = Readable.from([Buffer.from(rawBody, 'utf8')]);
        } else {
          stream = req.raw;
        }

        try {
          const part = await deps.uploadRecordingPartUseCase.execute({
            userId,
            recordingId,
            idx,
            stream,
            maxBytes: deps.maxPartBytes,
          });

          return reply.status(200).send({
            id: part.id,
            recording_id: part.recordingId,
            idx: part.idx,
            blob_key: part.blobKey,
            status: part.status,
          });
        } catch (err) {
          if (err instanceof RecordingNotFoundError) {
            throw new AppError('recording_not_found', 404, 'Recording not found');
          }
          if (err instanceof AudioPartIndexExceededError) {
            throw new AppError(err.code, 400, err.message);
          }
          if (err instanceof AudioStorageQuotaExceededError) {
            throw new AppError(err.code, 413, err.message);
          }
          if (err instanceof InvalidAudioContainerError) {
            throw new AppError('invalid_audio_format', 400, err.message);
          }
          if (err instanceof AudioPartTooLargeError) {
            throw new AppError('payload_too_large', 413, err.message);
          }
          throw err;
        }
      }
    );
  });

  // 4. POST /recordings/:id/finish (and /recordings/:id/process alias)
  const finishHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const params = req.params as { id: string };
    const recordingId = params.id;

    try {
      const result = await deps.finishRecordingUseCase.execute(userId, recordingId);
      return reply.status(200).send(result);
    } catch (err) {
      if (err instanceof RecordingNotFoundError) {
        throw new AppError('recording_not_found', 404, 'Recording not found');
      }
      if (err instanceof AiNotInPlanError) {
        throw new AppError(err.code, 403, err.message);
      }
      throw err;
    }
  };

  // Allow empty body on POST /recordings/:id/finish even when Content-Type: application/json is sent
  app.register(async (finishScope) => {
    finishScope.removeAllContentTypeParsers();
    finishScope.addContentTypeParser(
      '*',
      { parseAs: 'string' },
      (_req, body, done) => {
        if (!body || (typeof body === 'string' && body.trim() === '')) {
          done(null, {});
          return;
        }
        try {
          done(null, JSON.parse(body as string));
        } catch {
          done(null, {});
        }
      }
    );

    finishScope.post('/recordings/:id/finish', { preHandler: [authHook] }, finishHandler);
    finishScope.post('/recordings/:id/process', { preHandler: [authHook] }, finishHandler);
  });

  // 5. GET /recordings/:id/events (SSE)
  app.get(
    '/recordings/:id/events',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { id: string };
      const recordingId = params.id;

      let initial: RecordingStatusEvent;
      try {
        initial = await deps.getRecordingStatusUseCase.execute(userId, recordingId);
      } catch (err) {
        if (err instanceof RecordingNotFoundError) {
          throw new AppError('recording_not_found', 404, 'Recording not found');
        }
        throw err;
      }

      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      let closed = false;
      let lastStatus: RecordingStatus = initial.status;
      let lastError: string | null = initial.error ?? null;
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let pollTimer: NodeJS.Timeout | null = null;
      let subscription: { unsubscribe: () => Promise<void>; usingRedis: boolean } | null = null;

      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
          heartbeatTimer = null;
        }
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        if (subscription) {
          const sub = subscription;
          subscription = null;
          void sub.unsubscribe().catch(() => {});
        }
        if (!reply.raw.writableEnded) {
          try {
            reply.raw.end();
          } catch {
            // Ignore
          }
        }
      };

      const sendFrame = (event: RecordingStatusEvent) => {
        if (closed || reply.raw.writableEnded) return;
        const payload = JSON.stringify({
          status: event.status,
          error: event.error ?? null,
        });
        reply.raw.write(`data: ${payload}\n\n`);
      };

      // Send current status first
      sendFrame({ status: lastStatus, error: lastError });
      if (isTerminalStatus(lastStatus)) {
        cleanup();
        return;
      }

      req.raw.on('close', cleanup);
      reply.raw.on('close', cleanup);

      const handleNext = (next: RecordingStatusEvent) => {
        if (closed) return;
        const normErr = next.error ?? null;
        if (next.status === lastStatus && normErr === lastError) {
          return;
        }
        lastStatus = next.status;
        lastError = normErr;
        sendFrame({ status: lastStatus, error: lastError });
        if (isTerminalStatus(lastStatus)) {
          cleanup();
        }
      };

      subscription = await deps.eventsPort.subscribeStatus(recordingId, handleNext);
      if (closed) {
        await subscription.unsubscribe().catch(() => {});
        return;
      }

      // Check current DB status once right after subscribing to close any race window,
      // and poll every pollIntervalMs (fallback when Redis is down or missed a frame).
      const pollStatus = async () => {
        if (closed) return;
        try {
          const current = await deps.getRecordingStatusUseCase.execute(userId, recordingId);
          handleNext(current);
        } catch {
          // Ignore transient errors during polling
        }
      };

      await pollStatus();
      if (closed) return;

      heartbeatTimer = setInterval(() => {
        if (closed || reply.raw.writableEnded) return;
        reply.raw.write(': heartbeat\n\n');
      }, heartbeatMs);

      pollTimer = setInterval(() => {
        void pollStatus();
      }, pollIntervalMs);
    }
  );

  // 6. GET /recordings/:id/status
  app.get(
    '/recordings/:id/status',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { id: string };
      const recordingId = params.id;

      try {
        const status = await deps.getRecordingStatusUseCase.execute(userId, recordingId);
        return reply.status(200).send(status);
      } catch (err) {
        if (err instanceof RecordingNotFoundError) {
          throw new AppError('recording_not_found', 404, 'Recording not found');
        }
        throw err;
      }
    }
  );

  // 7. GET /recordings/:id/transcript-id
  app.get(
    '/recordings/:id/transcript-id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { id: string };
      const recordingId = params.id;

      try {
        const res = await deps.getTranscriptIdUseCase.execute(userId, recordingId);
        return reply.status(200).send(res);
      } catch (err) {
        if (err instanceof RecordingNotFoundError) {
          throw new AppError('recording_not_found', 404, 'Recording not found');
        }
        throw err;
      }
    }
  );

  // 8. POST /recordings/:id/failed
  app.post(
    '/recordings/:id/failed',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { id: string };
      const recordingId = params.id;

      const validated = await markRecordingFailedRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.markRecordingFailedUseCase.execute(userId, recordingId, validated.error);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof RecordingNotFoundError) {
          throw new AppError('recording_not_found', 404, 'Recording not found');
        }
        throw err;
      }
    }
  );

  // 9. POST /recordings/:id/completed
  app.register(async (completedScope) => {
    completedScope.removeAllContentTypeParsers();
    completedScope.addContentTypeParser(
      '*',
      { parseAs: 'string' },
      (_req, body, done) => {
        if (!body || (typeof body === 'string' && body.trim() === '')) {
          done(null, {});
          return;
        }
        try {
          done(null, JSON.parse(body as string));
        } catch {
          done(null, {});
        }
      }
    );

    completedScope.post(
      '/recordings/:id/completed',
      { preHandler: [authHook] },
      async (req: FastifyRequest, reply: FastifyReply) => {
        const userId = currentUserId(req);
        const params = req.params as { id: string };
        const recordingId = params.id;

        try {
          await deps.markRecordingCompletedUseCase.execute(userId, recordingId);
          return reply.status(204).send();
        } catch (err) {
          if (err instanceof RecordingNotFoundError) {
            throw new AppError('recording_not_found', 404, 'Recording not found');
          }
          throw err;
        }
      }
    );
  });
}
