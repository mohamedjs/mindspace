import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import type { SpaceActivityPort, TimelinePort } from './domain/ports.js';
import {
  KyselyNoteRepository,
  KyselyGroupRepository,
  KyselyRelationshipRepository,
  KyselyUnitOfWork,
} from './infrastructure/index.js';
import {
  ListNotesUseCase,
  GetNoteUseCase,
  CreateNoteUseCase,
  UpdateNoteContentUseCase,
  UpdateNoteColorUseCase,
  UpdateNoteTypeUseCase,
  UpdateNotePositionUseCase,
  UpdateNoteParentUseCase,
  DeleteNoteUseCase,
  BulkMoveNotesUseCase,
  BulkUpdateNotesUseCase,
  BulkDeleteNotesUseCase,
  BulkRestoreNotesUseCase,
  BulkCreateNotesUseCase,
  IngestNotesUseCase,
  ListGroupsUseCase,
  CreateGroupUseCase,
  UpdateGroupUseCase,
  DeleteGroupUseCase,
  ListRelationshipsUseCase,
  CreateRelationshipUseCase,
  DeleteRelationshipUseCase,
  GetMindMapUseCase,
} from './application/index.js';
import { registerNoteRoutes } from './presentation/routes.js';
import type { MindMapResult } from './domain/entities.js';

export * from './domain/entities.js';
export * from './domain/errors.js';
export * from './domain/ports.js';
export * from './domain/structure.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './presentation/routes.js';

export interface NotesModuleDependencies {
  db: Database;
  spacePort: SpaceActivityPort;
  timelinePort: TimelinePort;
  requireUser?: RequireUserHook;
}

export interface NotesModule {
  registerRoutes(app: FastifyInstance): void;
  getMindMap(userId: string, spaceId: string): Promise<MindMapResult>;
}

export function createNotesModule(deps: NotesModuleDependencies): NotesModule {
  const noteRepo = new KyselyNoteRepository(deps.db);
  const groupRepo = new KyselyGroupRepository(deps.db);
  const relRepo = new KyselyRelationshipRepository(deps.db);
  const uow = new KyselyUnitOfWork(deps.db);

  const listNotesUseCase = new ListNotesUseCase(noteRepo, deps.spacePort);
  const getNoteUseCase = new GetNoteUseCase(noteRepo);
  const createNoteUseCase = new CreateNoteUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const updateNoteContentUseCase = new UpdateNoteContentUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const updateNoteColorUseCase = new UpdateNoteColorUseCase(noteRepo);
  const updateNoteTypeUseCase = new UpdateNoteTypeUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const updateNotePositionUseCase = new UpdateNotePositionUseCase(noteRepo);
  const updateNoteParentUseCase = new UpdateNoteParentUseCase(noteRepo);
  const deleteNoteUseCase = new DeleteNoteUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const bulkMoveNotesUseCase = new BulkMoveNotesUseCase(noteRepo);
  const bulkUpdateNotesUseCase = new BulkUpdateNotesUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const bulkDeleteNotesUseCase = new BulkDeleteNotesUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const bulkRestoreNotesUseCase = new BulkRestoreNotesUseCase(noteRepo, deps.spacePort, deps.timelinePort, uow);
  const bulkCreateNotesUseCase = new BulkCreateNotesUseCase(noteRepo, relRepo, deps.spacePort, deps.timelinePort, uow);
  const ingestNotesUseCase = new IngestNotesUseCase(noteRepo, groupRepo, relRepo, deps.spacePort, deps.timelinePort, uow);
  const listGroupsUseCase = new ListGroupsUseCase(groupRepo, deps.spacePort);
  const createGroupUseCase = new CreateGroupUseCase(groupRepo, deps.spacePort);
  const updateGroupUseCase = new UpdateGroupUseCase(groupRepo);
  const deleteGroupUseCase = new DeleteGroupUseCase(groupRepo);
  const listRelationshipsUseCase = new ListRelationshipsUseCase(relRepo, deps.spacePort);
  const createRelationshipUseCase = new CreateRelationshipUseCase(relRepo, noteRepo, deps.spacePort);
  const deleteRelationshipUseCase = new DeleteRelationshipUseCase(relRepo, deps.spacePort);
  const getMindMapUseCase = new GetMindMapUseCase(noteRepo, deps.spacePort);

  return {
    registerRoutes: (app: FastifyInstance) => {
      registerNoteRoutes(app, {
        requireUser: deps.requireUser,
        listNotesUseCase,
        getNoteUseCase,
        createNoteUseCase,
        updateNoteContentUseCase,
        updateNoteColorUseCase,
        updateNoteTypeUseCase,
        updateNotePositionUseCase,
        updateNoteParentUseCase,
        deleteNoteUseCase,
        bulkMoveNotesUseCase,
        bulkUpdateNotesUseCase,
        bulkDeleteNotesUseCase,
        bulkRestoreNotesUseCase,
        bulkCreateNotesUseCase,
        ingestNotesUseCase,
        listGroupsUseCase,
        createGroupUseCase,
        updateGroupUseCase,
        deleteGroupUseCase,
        listRelationshipsUseCase,
        createRelationshipUseCase,
        deleteRelationshipUseCase,
        getMindMapUseCase,
      });
    },
    getMindMap: (userId, spaceId) => getMindMapUseCase.execute(userId, spaceId),
  };
}
