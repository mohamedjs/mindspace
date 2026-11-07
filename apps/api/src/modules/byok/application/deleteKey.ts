import { KeyNotFoundError, MissingKeyParamsError } from '../domain/errors.js';
import type { ByokRepositoryPort } from '../domain/ports.js';

export class DeleteKeyUseCase {
  constructor(private readonly byokRepo: ByokRepositoryPort) {}

  async execute(userId: string, keyId: string): Promise<{ ok: true }> {
    if (!keyId || typeof keyId !== 'string' || keyId.trim().length === 0) {
      throw new MissingKeyParamsError('Missing keyId');
    }

    const deleted = await this.byokRepo.deleteKey(userId, keyId.trim());
    if (!deleted) {
      throw new KeyNotFoundError();
    }

    return { ok: true };
  }
}
