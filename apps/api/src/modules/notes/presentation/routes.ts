import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createNoteRequestSchema,
  updateNoteContentRequestSchema,
  updateNoteColorRequestSchema,
  updateNoteTypeRequestSchema,
  updateNotePositionRequestSchema,
  updateNoteParentRequestSchema,
  bulkMoveNotesRequestSchema,
  bulkUpdateNotesRequestSchema,
  bulkDeleteNotesRequestSchema,
  bulkRestoreNotesRequestSchema,
  bulkCreateNotesRequestSchema,
  createGroupRequestSchema,
  updateGroupRequestSchema,
  createRelationshipRequestSchema,
  deleteRelationshipRequestSchema,
  ingestRequestSchema,
  type NoteType,
  type RelType,
} from '@mindspace/contracts';
import { requireUser, currentUserId, type RequireUserHook } from '../../../platform/http/auth.js';
import { AppError } from '../../../platform/http/errors.js';
import {
  NoteNotFoundError,
  GroupNotFoundError,
  RelationshipNotFoundError,
  CycleDetectedError,
  InvalidStructureError,
  LimitExceededError,
} from '../domain/errors.js';
import type {
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
} from '../application/index.js';

export interface NoteRoutesDependencies {
  requireUser?: RequireUserHook;
  listNotesUseCase: ListNotesUseCase;
  getNoteUseCase: GetNoteUseCase;
  createNoteUseCase: CreateNoteUseCase;
  updateNoteContentUseCase: UpdateNoteContentUseCase;
  updateNoteColorUseCase: UpdateNoteColorUseCase;
  updateNoteTypeUseCase: UpdateNoteTypeUseCase;
  updateNotePositionUseCase: UpdateNotePositionUseCase;
  updateNoteParentUseCase: UpdateNoteParentUseCase;
  deleteNoteUseCase: DeleteNoteUseCase;
  bulkMoveNotesUseCase: BulkMoveNotesUseCase;
  bulkUpdateNotesUseCase: BulkUpdateNotesUseCase;
  bulkDeleteNotesUseCase: BulkDeleteNotesUseCase;
  bulkRestoreNotesUseCase: BulkRestoreNotesUseCase;
  bulkCreateNotesUseCase: BulkCreateNotesUseCase;
  ingestNotesUseCase: IngestNotesUseCase;
  listGroupsUseCase: ListGroupsUseCase;
  createGroupUseCase: CreateGroupUseCase;
  updateGroupUseCase: UpdateGroupUseCase;
  deleteGroupUseCase: DeleteGroupUseCase;
  listRelationshipsUseCase: ListRelationshipsUseCase;
  createRelationshipUseCase: CreateRelationshipUseCase;
  deleteRelationshipUseCase: DeleteRelationshipUseCase;
  getMindMapUseCase: GetMindMapUseCase;
}

export function registerNoteRoutes(app: FastifyInstance, deps: NoteRoutesDependencies): void {
  const authHook = deps.requireUser || requireUser;

  // ============================================================
  // Bulk Note Routes (Must be before parameterized :note_id routes)
  // ============================================================

  // POST /notes/move
  app.post('/notes/move', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await bulkMoveNotesRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      await deps.bulkMoveNotesUseCase.execute(userId, validated.moves);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof LimitExceededError) {
        throw new AppError('limit_exceeded', 400, err.message);
      }
      if (err instanceof NoteNotFoundError) {
        throw new AppError('note_not_found', 404, err.message);
      }
      throw err;
    }
  });

  // POST /notes/bulk-update
  app.post('/notes/bulk-update', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await bulkUpdateNotesRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      await deps.bulkUpdateNotesUseCase.execute(userId, validated.ids, {
        color: validated.color,
        type: validated.type,
      });
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof LimitExceededError) {
        throw new AppError('limit_exceeded', 400, err.message);
      }
      if (err instanceof NoteNotFoundError) {
        throw new AppError('note_not_found', 404, err.message);
      }
      throw err;
    }
  });

  // POST /notes/bulk-delete
  app.post('/notes/bulk-delete', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await bulkDeleteNotesRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      await deps.bulkDeleteNotesUseCase.execute(userId, validated.ids);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof LimitExceededError) {
        throw new AppError('limit_exceeded', 400, err.message);
      }
      if (err instanceof NoteNotFoundError) {
        throw new AppError('note_not_found', 404, err.message);
      }
      throw err;
    }
  });

  // POST /notes/bulk-restore
  app.post('/notes/bulk-restore', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await bulkRestoreNotesRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      await deps.bulkRestoreNotesUseCase.execute(userId, validated.ids);
      return reply.status(204).send();
    } catch (err) {
      if (err instanceof LimitExceededError) {
        throw new AppError('limit_exceeded', 400, err.message);
      }
      if (err instanceof NoteNotFoundError) {
        throw new AppError('note_not_found', 404, err.message);
      }
      throw err;
    }
  });

  // POST /notes/bulk-create
  app.post('/notes/bulk-create', { preHandler: [authHook] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await bulkCreateNotesRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      const result = await deps.bulkCreateNotesUseCase.execute(userId, {
        notes: validated.notes.map((n) => ({
          id: n.id,
          spaceId: n.space_id,
          content: n.content,
          title: n.title,
          type: n.type,
          color: n.color,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          parentId: n.parent_id,
          dueAt: n.due_at,
        })),
        relations: validated.relations?.map((r) => ({
          spaceId: r.space_id,
          fromNoteId: r.from_note_id,
          toNoteId: r.to_note_id,
          type: r.type,
        })),
      });

      return reply.status(201).send(result);
    } catch (err) {
      if (err instanceof LimitExceededError) {
        throw new AppError('limit_exceeded', 400, err.message);
      }
      if (err instanceof NoteNotFoundError) {
        throw new AppError('note_not_found', 404, err.message);
      }
      if (err instanceof Error && err.name === 'SpaceNotFoundError') {
        throw new AppError('space_not_found', 404, err.message);
      }
      throw err;
    }
  });

  // ============================================================
  // Spaces Note Routes
  // ============================================================

  // GET /spaces/:space_id/notes
  app.get(
    '/spaces/:space_id/notes',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        const notes = await deps.listNotesUseCase.execute(userId, spaceId);
        return reply.status(200).send(notes);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // POST /spaces/:space_id/notes
  app.post(
    '/spaces/:space_id/notes',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;
      const validated = await createNoteRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        const created = await deps.createNoteUseCase.execute(userId, {
          spaceId,
          content: validated.content,
          type: validated.type,
          x: validated.x,
          y: validated.y,
          parentId: validated.parent_id,
          title: validated.title,
          color: validated.color,
          width: validated.width,
          height: validated.height,
          dueAt: validated.due_at,
        });

        return reply.status(201).send(created);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, err.message);
        }
        if (err instanceof CycleDetectedError) {
          throw new AppError('invalid_structure', 422, err.message);
        }
        throw err;
      }
    }
  );

  // GET /spaces/:space_id/mind-map
  app.get(
    '/spaces/:space_id/mind-map',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        const mindMap = await deps.getMindMapUseCase.execute(userId, spaceId);
        return reply.status(200).send(mindMap);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // POST /spaces/:space_id/ingest
  app.post(
    '/spaces/:space_id/ingest',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      const validated = await ingestRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        const result = await deps.ingestNotesUseCase.execute(userId, {
          spaceId,
          notes: validated.notes.map((n) => ({
            clientKey: (n.client_key || n.clientKey)!,
            title: n.title,
            content: n.content,
            type: n.type || 'idea',
            color: n.color,
            parentKey: n.parent_key || n.parentKey,
            dueAt: n.due_at || n.dueAt,
          })),
          relations: validated.relations?.map((r) => ({
            from: r.from,
            to: r.to,
            type: r.type || 'related',
          })),
          groups: validated.groups?.map((g) => ({
            title: g.title,
            color: g.color,
            memberKeys: g.member_keys || g.memberKeys || [],
          })),
        });

        return reply.status(200).send(result);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        if (err instanceof LimitExceededError) {
          throw new AppError('limit_exceeded', 400, err.message);
        }
        if (err instanceof InvalidStructureError) {
          throw new AppError('invalid_structure', 422, err.message);
        }
        throw err;
      }
    }
  );

  // ============================================================
  // Individual Note Routes
  // ============================================================

  // GET /notes/:note_id
  app.get(
    '/notes/:note_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;

      try {
        const note = await deps.getNoteUseCase.execute(userId, noteId);
        return reply.status(200).send(note);
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // PATCH /notes/:note_id/content
  app.patch(
    '/notes/:note_id/content',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;
      const validated = await updateNoteContentRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateNoteContentUseCase.execute(
          userId,
          noteId,
          validated.title ?? null,
          validated.content
        );
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // PATCH /notes/:note_id/color
  app.patch(
    '/notes/:note_id/color',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;
      const validated = await updateNoteColorRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateNoteColorUseCase.execute(userId, noteId, validated.color);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // PATCH /notes/:note_id/type
  app.patch(
    '/notes/:note_id/type',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;
      const validated = await updateNoteTypeRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateNoteTypeUseCase.execute(userId, noteId, validated.type);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // PATCH /notes/:note_id/position
  app.patch(
    '/notes/:note_id/position',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;
      const validated = await updateNotePositionRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateNotePositionUseCase.execute(userId, noteId, validated.x, validated.y);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // PATCH /notes/:note_id/parent
  app.patch(
    '/notes/:note_id/parent',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;
      const validated = await updateNoteParentRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateNoteParentUseCase.execute(userId, noteId, validated.parent_id);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, err.message);
        }
        if (err instanceof CycleDetectedError) {
          throw new AppError('invalid_structure', 422, err.message);
        }
        throw err;
      }
    }
  );

  // DELETE /notes/:note_id
  app.delete(
    '/notes/:note_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { note_id: string };
      const noteId = params.note_id;

      try {
        await deps.deleteNoteUseCase.execute(userId, noteId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, 'Note not found');
        }
        throw err;
      }
    }
  );

  // ============================================================
  // Groups Routes
  // ============================================================

  // GET /spaces/:space_id/groups
  app.get(
    '/spaces/:space_id/groups',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        const groups = await deps.listGroupsUseCase.execute(userId, spaceId);
        return reply.status(200).send(groups);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // POST /spaces/:space_id/groups
  app.post(
    '/spaces/:space_id/groups',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;
      const validated = await createGroupRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        const group = await deps.createGroupUseCase.execute(userId, {
          spaceId,
          title: validated.title,
          x: validated.x,
          y: validated.y,
          width: validated.width,
          height: validated.height,
          color: validated.color,
        });

        return reply.status(201).send(group);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // PATCH /groups/:group_id
  app.patch(
    '/groups/:group_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { group_id: string };
      const groupId = params.group_id;
      const validated = await updateGroupRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.updateGroupUseCase.execute(userId, groupId, validated);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof GroupNotFoundError) {
          throw new AppError('group_not_found', 404, 'Group not found');
        }
        throw err;
      }
    }
  );

  // DELETE /groups/:group_id
  app.delete(
    '/groups/:group_id',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { group_id: string };
      const groupId = params.group_id;

      try {
        await deps.deleteGroupUseCase.execute(userId, groupId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof GroupNotFoundError) {
          throw new AppError('group_not_found', 404, 'Group not found');
        }
        throw err;
      }
    }
  );

  // ============================================================
  // Relationships Routes
  // ============================================================

  // GET /spaces/:space_id/relationships
  app.get(
    '/spaces/:space_id/relationships',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const params = req.params as { space_id: string };
      const spaceId = params.space_id;

      try {
        const relations = await deps.listRelationshipsUseCase.execute(userId, spaceId);
        return reply.status(200).send(relations);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );

  // POST /relationships
  app.post(
    '/relationships',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const validated = await createRelationshipRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        const rel = await deps.createRelationshipUseCase.execute(userId, {
          spaceId: validated.space_id,
          fromNoteId: validated.from_note_id,
          toNoteId: validated.to_note_id,
          type: validated.type,
        });

        return reply.status(201).send(rel);
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        if (err instanceof NoteNotFoundError) {
          throw new AppError('note_not_found', 404, err.message);
        }
        if (err instanceof InvalidStructureError) {
          throw new AppError('invalid_structure', 422, err.message);
        }
        throw err;
      }
    }
  );

  // DELETE /relationships
  app.delete(
    '/relationships',
    { preHandler: [authHook] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = currentUserId(req);
      const input = (req.body && Object.keys(req.body).length > 0 ? req.body : req.query) as any;
      const validated = await deleteRelationshipRequestSchema.validate(input, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        await deps.deleteRelationshipUseCase.execute(
          userId,
          validated.space_id,
          validated.from_note_id,
          validated.to_note_id,
          validated.type
        );

        return reply.status(204).send();
      } catch (err) {
        if (err instanceof Error && err.name === 'SpaceNotFoundError') {
          throw new AppError('space_not_found', 404, 'Space not found');
        }
        throw err;
      }
    }
  );
}
