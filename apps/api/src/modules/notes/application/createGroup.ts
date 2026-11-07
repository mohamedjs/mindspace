import type {
  GroupRepositoryPort,
  SpaceActivityPort,
  CreateGroupData,
} from '../domain/ports.js';
import type { GroupOut } from '../domain/entities.js';

export class CreateGroupUseCase {
  constructor(
    private groupRepo: GroupRepositoryPort,
    private spacePort: SpaceActivityPort
  ) {}

  async execute(userId: string, data: CreateGroupData): Promise<GroupOut> {
    await this.spacePort.ensureOwned(data.spaceId, userId);
    return this.groupRepo.create(userId, data);
  }
}
