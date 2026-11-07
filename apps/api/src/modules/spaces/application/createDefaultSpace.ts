import type { SpaceSeedPort } from '../domain/ports.js';

export class CreateDefaultSpaceUseCase {
  constructor(private spaceRepo: SpaceSeedPort) {}

  async execute(trxOrDb: unknown, userId: string): Promise<void> {
    await this.spaceRepo.createDefaultSpace(trxOrDb, userId);
  }
}
