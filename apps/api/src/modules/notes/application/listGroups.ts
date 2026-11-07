import type { GroupRepositoryPort, SpaceActivityPort } from '../domain/ports.js';
import type { GroupOut } from '../domain/entities.js';

export class ListGroupsUseCase {
  constructor(
    private groupRepo: GroupRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, spaceId: string): Promise<GroupOut[]> {
    await this.spacePort.ensureOwned(spaceId, userId);
    return this.groupRepo.listBySpace(userId, spaceId);
  }
}
