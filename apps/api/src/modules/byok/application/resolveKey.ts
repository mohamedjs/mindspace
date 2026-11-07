import { decryptApiKey } from '../domain/crypto.js';
import { PROVIDER_BASE_URL, type ResolvedKey } from '../domain/entities.js';
import {
  ByokRequiredError,
  NoPlatformKeyError,
  UnsupportedProviderError,
} from '../domain/errors.js';
import type { ByokRepositoryPort } from '../domain/ports.js';

export type PlatformKeyResolver = (provider: string) => string | undefined;

export class ResolveKeyUseCase {
  constructor(
    private readonly byokRepo: ByokRepositoryPort,
    private readonly masterKeyBase64: string,
    private readonly getPlatformKey: PlatformKeyResolver
  ) {}

  async execute(userId: string, provider: string, byokOnly: boolean): Promise<ResolvedKey> {
    const baseUrl = PROVIDER_BASE_URL[provider];
    if (!baseUrl) {
      throw new UnsupportedProviderError(provider);
    }

    const activeKey = await this.byokRepo.findActiveEncryptedKey(userId, provider);

    if (activeKey) {
      const apiKey = await decryptApiKey(activeKey.encryptedKey, this.masterKeyBase64);
      return {
        apiKey,
        usesPlatformKey: false,
        baseUrl,
      };
    }

    if (byokOnly) {
      throw new ByokRequiredError();
    }

    const platformKey = this.getPlatformKey(provider);
    if (!platformKey) {
      throw new NoPlatformKeyError(provider);
    }

    return {
      apiKey: platformKey,
      usesPlatformKey: true,
      baseUrl,
    };
  }
}
