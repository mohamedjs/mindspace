import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import { KyselyTimelineRepository } from './infrastructure/kyselyTimelineRepo.js';
import { ListTimelineEventsUseCase } from './application/listTimelineEvents.js';
import { RecordTimelineEventUseCase } from './application/recordTimelineEvent.js';
import { registerTimelineRoutes, type SpaceOwnershipChecker } from './presentation/routes.js';
import type { TimelineEvent, TimelineEventInput } from './domain/entities.js';

export * from './domain/entities.js';
export * from './domain/ports.js';
export * from './application/listTimelineEvents.js';
export * from './application/recordTimelineEvent.js';
export * from './infrastructure/kyselyTimelineRepo.js';

export interface TimelineModule {
  registerRoutes(app: FastifyInstance): void;
  recordEvent(input: TimelineEventInput, trx?: unknown): Promise<TimelineEvent>;
  listEvents(userId: string, spaceId: string, limit?: number): Promise<TimelineEvent[]>;
}

export interface TimelineModuleDependencies {
  db: Database;
  requireUser?: RequireUserHook;
  spaceChecker: SpaceOwnershipChecker;
}

export function createTimelineModule(deps: TimelineModuleDependencies): TimelineModule {
  const repo = new KyselyTimelineRepository(deps.db);
  const listUseCase = new ListTimelineEventsUseCase(repo);
  const recordUseCase = new RecordTimelineEventUseCase(repo);

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerTimelineRoutes(app, {
        requireUser: deps.requireUser,
        spaceChecker: deps.spaceChecker,
        listTimelineEventsUseCase: listUseCase,
      });
    },
    recordEvent: (input, trx) => recordUseCase.execute(input, trx),
    listEvents: (userId, spaceId, limit) => listUseCase.execute(userId, spaceId, limit),
  };
}
