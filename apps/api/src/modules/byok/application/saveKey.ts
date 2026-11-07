import { encryptApiKey, keyHint } from '../domain/crypto.js';
import { isByokProvider } from '../domain/entities.js';
import {
  CustomBaseUrlNotAllowedError,
  InvalidKeyFormatError,
  KeyValidationFailedError,
  MissingKeyParamsError,
  UnsupportedByokProviderError,
} from '../domain/errors.js';
import type { ByokRepositoryPort, KeyValidator } from '../domain/ports.js';

export interface SaveKeyInput {
  userId: string;
  provider?: unknown;
  apiKey?: unknown;
  label?: string | null;
  baseUrl?: unknown;
  base_url?: unknown;
}

export class SaveKeyUseCase {
  constructor(
    private readonly byokRepo: ByokRepositoryPort,
    private getKeyValidator: () => KeyValidator,
    private readonly masterKeyBase64: string
  ) {}

  async execute(input: SaveKeyInput): Promise<{ ok: true; keyHint: string }> {
    if (input.baseUrl !== undefined || input.base_url !== undefined) {
      throw new CustomBaseUrlNotAllowedError();
    }

    if (!input.provider || !input.apiKey) {
      throw new MissingKeyParamsError();
    }

    if (typeof input.apiKey !== 'string' || input.apiKey.trim().length < 8) {
      throw new InvalidKeyFormatError();
    }

    if (!isByokProvider(input.provider)) {
      throw new UnsupportedByokProviderError(String(input.provider));
    }

    const trimmedKey = input.apiKey.trim();
    const validator = this.getKeyValidator();

    try {
      const valid = await validator.validate(input.provider, trimmedKey);
      if (valid === false) {
        throw new KeyValidationFailedError();
      }
    } catch (err) {
      if (err instanceof KeyValidationFailedError) {
        throw err;
      }
      throw new KeyValidationFailedError();
    }

    const encryptedKey = await encryptApiKey(trimmedKey, this.masterKeyBase64);
    const hint = keyHint(trimmedKey);
    const cleanLabel =
      typeof input.label === 'string' && input.label.trim().length > 0
        ? input.label.trim()
        : null;

    await this.byokRepo.saveKey({
      userId: input.userId,
      provider: input.provider,
      label: cleanLabel,
      encryptedKey,
      keyHint: hint,
    });

    return { ok: true, keyHint: hint };
  }
}
