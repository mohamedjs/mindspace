import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TimelineEventOut } from '@mindspace/contracts';
import { requireUser, currentUserId, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import type { ListTimelineEventsUseCase } from '../application/listTimelineEvents.js';

export interface SpaceOwnershipChecker {
  ensureOwned(spaceId: string, userId: string): Promise<void>;
}

export interface TimelineRoutesDependencies {
  requireUser?: RequireUserHook;
  spaceChecker: SpaceOwnershipChecker;
  listTimelineEventsUseCase: ListTimelineEventsUseCase;
}

export function registerTimelineRoutes(app: FastifyInstance, deps: TimelineRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  app.get(
    '/spaces/:space_id/timeline',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const query = req.query as { limit?: string };
      const spaceId = params.space_id;
      const limit = query.limit ? Math.min(100, Math.max(1, parseInt(query.limit, 10) || 50)) : 50;

      try {
        await deps.spaceChecker.ensureOwned(spaceId, userId);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }

      const events = await deps.listTimelineEventsUseCase.execute(userId, spaceId, limit);

      const response: TimelineEventOut[] = events.map((e) => ({
        id: e.id,
        type: e.type,
        ref_id: e.refId,
        summary: e.summary,
        created_at: typeof e.createdAt === 'string' ? e.createdAt : e.createdAt.toISOString(),
      }));

      return reply.status(200).send(response);
    }
  );
}
