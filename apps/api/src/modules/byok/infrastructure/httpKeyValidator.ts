import { PROVIDER_BASE_URL, type ByokProvider } from '../domain/entities.js';
import { KeyValidationFailedError } from '../domain/errors.js';
import type { KeyValidator } from '../domain/ports.js';

const VALIDATION_TIMEOUT_MS = 15_000;

export class HttpKeyValidator implements KeyValidator {
  constructor(private readonly fetchFn: typeof fetch = globalThis.fetch) {}

  async validate(provider: ByokProvider, apiKey: string): Promise<void> {
    const baseUrl = PROVIDER_BASE_URL[provider];
    if (!baseUrl) {
      throw new KeyValidationFailedError();
    }

    const res = await this.fetchFn(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new KeyValidationFailedError();
    }
  }
}

export class FakeKeyValidator implements KeyValidator {
  public readonly calls: Array<{ provider: ByokProvider; apiKey: string }> = [];
  private shouldRejectPredicate: (provider: ByokProvider, apiKey: string) => boolean = (
    _provider,
    apiKey
  ) => /invalid|rejected|bad/i.test(apiKey);

  setRejectPredicate(fn: (provider: ByokProvider, apiKey: string) => boolean): void {
    this.shouldRejectPredicate = fn;
  }

  async validate(provider: ByokProvider, apiKey: string): Promise<void> {
    this.calls.push({ provider, apiKey });
    if (this.shouldRejectPredicate(provider, apiKey)) {
      throw new KeyValidationFailedError();
    }
  }
}
