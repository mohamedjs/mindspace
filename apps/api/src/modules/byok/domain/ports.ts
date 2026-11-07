import type { ByokProvider, UserKeySummary } from './entities.js';

export interface KeyValidator {
  validate(provider: ByokProvider, apiKey: string): Promise<boolean | void>;
}

export interface SaveKeyRepoInput {
  userId: string;
  provider: ByokProvider;
  label: string | null;
  encryptedKey: Uint8Array;
  keyHint: string;
}

export interface ByokRepositoryPort {
  listByUser(userId: string): Promise<UserKeySummary[]>;
  findActiveEncryptedKey(
    userId: string,
    provider: string
  ): Promise<{ id: string; encryptedKey: Uint8Array } | null>;
  saveKey(input: SaveKeyRepoInput): Promise<UserKeySummary>;
  deleteKey(userId: string, keyId: string): Promise<boolean>;
}
