import type { GroupRepositoryPort } from '../domain/ports.js';
import { GroupNotFoundError } from '../domain/errors.js';

export class DeleteGroupUseCase {
  constructor(private groupRepo: GroupRepositoryPort) {}

  async execute(userId: string, groupId: string): Promise<void> {
    const existing = await this.groupRepo.findById(userId, groupId);
    if (!existing) {
      throw new GroupNotFoundError();
    }
    await this.groupRepo.softDelete(userId, groupId);
  }
}
