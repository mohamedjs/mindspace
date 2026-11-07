import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { currentUserId, requireUser, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import {
  CustomBaseUrlNotAllowedError,
  InvalidKeyFormatError,
  KeyNotFoundError,
  KeyValidationFailedError,
  MissingKeyParamsError,
  UnsupportedByokProviderError,
} from '../domain/errors.js';
import type { DeleteKeyUseCase } from '../application/deleteKey.js';
import type { ListKeysUseCase } from '../application/listKeys.js';
import type { SaveKeyUseCase } from '../application/saveKey.js';

export interface ByokRoutesDependencies {
  requireUser?: RequireUserHook;
  listKeysUseCase: ListKeysUseCase;
  saveKeyUseCase: SaveKeyUseCase;
  deleteKeyUseCase: DeleteKeyUseCase;
}

export function registerByokRoutes(app: FastifyInstance, deps: ByokRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  // 1. GET /keys
  app.get(
    '/keys',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const keys = await deps.listKeysUseCase.execute(userId);
      return reply.status(200).send(keys);
    }
  );

  // 2. POST /keys
  app.post(
    '/keys',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const body = (req.body ?? {}) as Record<string, unknown>;

      try {
        const result = await deps.saveKeyUseCase.execute({
          userId,
          provider: body.provider,
          apiKey: body.apiKey ?? body.api_key,
          label: typeof body.label === 'string' ? body.label : null,
          baseUrl: body.baseUrl,
          base_url: body.base_url,
        });
        return reply.status(200).send(result);
      } catch (err) {
        if (
          err instanceof CustomBaseUrlNotAllowedError ||
          err instanceof MissingKeyParamsError ||
          err instanceof InvalidKeyFormatError ||
          err instanceof UnsupportedByokProviderError ||
          err instanceof KeyValidationFailedError
        ) {
          throw new AppError(err.code, err.status, err.message);
        }
        throw err;
      }
    }
  );

  // 3. DELETE /keys/:key_id
  app.delete(
    '/keys/:key_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { key_id: string };

      try {
        const result = await deps.deleteKeyUseCase.execute(userId, params.key_id);
        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof KeyNotFoundError || err instanceof MissingKeyParamsError) {
          throw new AppError(err.code, err.status, err.message);
        }
        throw err;
      }
    }
  );
}
