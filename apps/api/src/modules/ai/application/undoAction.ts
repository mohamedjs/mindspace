import { ActionNotFoundError } from '../domain/errors.js';
import type {
  AiActionRepositoryPort,
  AiNotePort,
  AiRelationshipPort,
  AiSpacePort,
  AiUnitOfWorkPort,
} from '../domain/ports.js';

export interface UndoActionDependencies {
  actionRepo: AiActionRepositoryPort;
  notePort: AiNotePort;
  relationshipPort: AiRelationshipPort;
  spacePort: AiSpacePort;
  unitOfWork: AiUnitOfWorkPort;
}

export class UndoActionUseCase {
  private readonly actionRepo: AiActionRepositoryPort;
  private readonly notePort: AiNotePort;
  private readonly relationshipPort: AiRelationshipPort;
  private readonly spacePort: AiSpacePort;
  private readonly unitOfWork: AiUnitOfWorkPort;

  constructor(deps: UndoActionDependencies) {
    this.actionRepo = deps.actionRepo;
    this.notePort = deps.notePort;
    this.relationshipPort = deps.relationshipPort;
    this.spacePort = deps.spacePort;
    this.unitOfWork = deps.unitOfWork;
  }

  async execute(userId: string, actionId: string): Promise<void> {
    const action = await this.actionRepo.findActionById(actionId, userId);
    if (!action) {
      throw new ActionNotFoundError();
    }

    if (action.status === 'undone') {
      return;
    }

    await this.unitOfWork.runInTransaction(async (trx) => {
      const items = await this.actionRepo.listActionItems(actionId, trx);
      // Reverse order replay
      const sortedItems = [...items].sort((a, b) => b.sortOrder - a.sortOrder);
      let deletedNotesCount = 0;

      for (const item of sortedItems) {
        if (!item.targetId) continue;

        if (item.targetType === 'sticky_note') {
          if (item.operation === 'create_note') {
            await this.notePort.softDeleteNote(item.targetId, userId, trx);
            deletedNotesCount++;
          } else if (item.operation === 'update_note') {
            await this.notePort.updateNoteContent(
              item.targetId,
              userId,
              {
                content: (item.inversePatch?.content as string) ?? undefined,
                title: (item.inversePatch?.title as string) ?? null,
              },
              trx
            );
          }
        } else if (item.targetType === 'relationship') {
          await this.relationshipPort.softDeleteRelationship(item.targetId, userId, trx);
        }

        await this.actionRepo.updateActionItemApplied(item.id, null, trx);
      }

      await this.relationshipPort.softDeleteRelationshipsForAction(actionId, userId, trx);

      if (deletedNotesCount > 0 && action.spaceId) {
        await this.spacePort.bumpActivity(action.spaceId, -deletedNotesCount, trx);
      }

      await this.actionRepo.updateActionStatus(actionId, 'undone', new Date(), trx);
    });
  }
}
