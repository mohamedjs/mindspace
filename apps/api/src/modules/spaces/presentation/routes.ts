import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSpaceRequestSchema,
  updateSpaceRequestSchema,
  type SpaceOut,
} from '@mindspace/contracts';
import { requireUser, currentUserId, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import { SpaceNotFoundError } from '../domain/errors.js';
import type { ListSpacesUseCase } from '../application/listSpaces.js';
import type { CreateSpaceUseCase } from '../application/createSpace.js';
import type { UpdateSpaceUseCase } from '../application/updateSpace.js';
import type { DeleteSpaceUseCase } from '../application/deleteSpace.js';

export interface SpaceRoutesDependencies {
  requireUser?: RequireUserHook;
  listSpacesUseCase: ListSpacesUseCase;
  createSpaceUseCase: CreateSpaceUseCase;
  updateSpaceUseCase: UpdateSpaceUseCase;
  deleteSpaceUseCase: DeleteSpaceUseCase;
}

export function registerSpaceRoutes(app: FastifyInstance, deps: SpaceRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  // 1. GET /spaces
  app.get('/spaces', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const spaces = await deps.listSpacesUseCase.execute(userId);
    return reply.status(200).send(spaces);
  });

  // 2. POST /spaces
  app.post('/spaces', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await createSpaceRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    const space = await deps.createSpaceUseCase.execute(userId, validated.name, validated.emoji);
    return reply.status(201).send(space);
  });

  // 3. PATCH /spaces/:space_id
  app.patch(
    '/spaces/:space_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;
      const validated = await updateSpaceRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateSpaceUseCase.execute(userId, spaceId, validated.name);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof SpaceNotFoundError) {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // 4. DELETE /spaces/:space_id
  app.delete(
    '/spaces/:space_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        await deps.deleteSpaceUseCase.execute(userId, spaceId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof SpaceNotFoundError) {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );
}
