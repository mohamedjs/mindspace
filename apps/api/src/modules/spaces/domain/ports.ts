import type { Space, SpaceSummary } from './entities.js';

export interface SpaceSeedPort {
  createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void>;
}

export interface SpaceRepositoryPort extends SpaceSeedPort {
  listSpaces(userId: string): Promise<SpaceSummary[]>;
  findById(userId: string, spaceId: string, trx?: unknown): Promise<Space | null>;
  createSpace(userId: string, name: string, emoji?: string): Promise<SpaceSummary>;
  updateSpaceName(userId: string, spaceId: string, name: string): Promise<void>;
  softDeleteSpace(userId: string, spaceId: string): Promise<void>;
  bumpActivity(spaceId: string, noteDelta: number, trx?: unknown): Promise<void>;
}
