export interface SpaceSeedPort {
  createDefaultSpace(trxOrDb: unknown, userId: string): Promise<void>;
}
