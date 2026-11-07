import type { GroupRepositoryPort, CreateGroupData } from '../domain/ports.js';
import { GroupNotFoundError } from '../domain/errors.js';

export class UpdateGroupUseCase {
  constructor(private groupRepo: GroupRepositoryPort) {}

  async execute(
    userId: string,
    groupId: string,
    data: Partial<CreateGroupData>
  ): Promise<void> {
    const existing = await this.groupRepo.findById(userId, groupId);
    if (!existing) {
      throw new GroupNotFoundError();
    }
    await this.groupRepo.update(userId, groupId, data);
  }
}
