import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  aiExtractRequestSchema,
  aiNoteWriteRequestSchema,
  updateModelPreferencesRequestSchema,
} from '@mindspace/contracts';
import { currentUserId, requireUser, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import { AiDomainError } from '../domain/errors.js';
import type {
  ExtractThoughtsUseCase,
  GetModelPreferencesUseCase,
  ListModelsUseCase,
  UndoActionUseCase,
  UpdateModelPreferencesUseCase,
  WriteNoteUseCase,
} from '../application/index.js';

export interface AiRoutesDependencies {
  requireUser?: RequireUserHook;
  listModelsUseCase: ListModelsUseCase;
  getModelPreferencesUseCase: GetModelPreferencesUseCase;
  updateModelPreferencesUseCase: UpdateModelPreferencesUseCase;
  extractThoughtsUseCase: ExtractThoughtsUseCase;
  writeNoteUseCase: WriteNoteUseCase;
  undoActionUseCase: UndoActionUseCase;
}

export function registerAiRoutes(app: FastifyInstance, deps: AiRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  // GET /models
  app.get('/models', { preHandler: [authHook] }, async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      const models = await deps.listModelsUseCase.execute();
      return reply.status(200).send(
        models.map((m) => ({
          id: m.id,
          provider: m.provider,
          model_id: m.model_id,
          display_name: m.display_name,
          kind: m.kind,
          credit_multiplier: m.credit_multiplier,
          tier: m.tier,
          is_default: m.is_default,
        }))
      );
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // GET /models/preferences
  app.get('/models/preferences', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = currentUserId(req);
      const preferences = await deps.getModelPreferencesUseCase.execute(userId);
      return reply.status(200).send(preferences);
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // PUT /models/preferences
  app.put('/models/preferences', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = currentUserId(req);
      const body = await updateModelPreferencesRequestSchema.validate(req.body, { stripUnknown: false });
      const modelRowId = (body.model_row_id ?? body.modelRowId) ?? null;

      await deps.updateModelPreferencesUseCase.execute(userId, body.kind, modelRowId);
      return reply.status(204).send();
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // PATCH /models/preferences
  app.patch('/models/preferences', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = currentUserId(req);
      const body = await updateModelPreferencesRequestSchema.validate(req.body, { stripUnknown: false });
      const modelRowId = (body.model_row_id ?? body.modelRowId) ?? null;

      await deps.updateModelPreferencesUseCase.execute(userId, body.kind, modelRowId);
      return reply.status(204).send();
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // POST /ai/extract
  app.post('/ai/extract', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = currentUserId(req);
      const body = await aiExtractRequestSchema.validate(req.body, { stripUnknown: false });
      const transcriptId = body.transcriptId ?? body.transcript_id;
      const spaceId = body.spaceId ?? body.space_id;
      const parentNoteId = body.parentNoteId ?? body.parent_note_id ?? null;

      if (!transcriptId || !spaceId) {
        throw new AppError('missing_params', 400, 'transcriptId and spaceId are required');
      }

      const result = await deps.extractThoughtsUseCase.execute({
        userId,
        transcriptId,
        spaceId,
        parentNoteId,
      });

      return reply.status(200).send({
        aiActionId: result.aiActionId,
        noteIds: result.noteIds,
        creditsCharged: result.creditsCharged,
      });
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // POST /ai/note-write
  app.post('/ai/note-write', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = currentUserId(req);
      const body = await aiNoteWriteRequestSchema.validate(req.body, { stripUnknown: false });
      const transcriptId = body.transcriptId ?? body.transcript_id;
      const noteId = body.noteId ?? body.note_id;

      if (!transcriptId || !noteId) {
        throw new AppError('missing_params', 400, 'transcriptId and noteId are required');
      }

      const result = await deps.writeNoteUseCase.execute({
        userId,
        transcriptId,
        noteId,
      });

      return reply.status(200).send({
        noteId: result.noteId,
        changed: result.changed,
        creditsCharged: result.creditsCharged,
      });
    } catch (err) {
      mapAndRethrow(err);
    }
  });

  // POST /ai/actions/:id/undo
  app.post<{ Params: { id: string } }>(
    '/ai/actions/:id/undo',
    { preHandler: [authHook] },
    async (req, reply) => {
      try {
        const userId = currentUserId(req);
        const actionId = req.params.id;

        if (!actionId) {
          throw new AppError('missing_params', 400, 'action id is required');
        }

        await deps.undoActionUseCase.execute(userId, actionId);
        return reply.status(204).send();
      } catch (err) {
        mapAndRethrow(err);
      }
    }
  );
}

function mapAndRethrow(err: unknown): never {
  if (err instanceof AppError) {
    throw err;
  }
  if (err instanceof AiDomainError) {
    throw new AppError(err.code, err.status, err.message);
  }
  if (err instanceof Error && err.name === 'ValidationError') {
    throw err;
  }
  throw err;
}
