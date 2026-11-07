import type { CreditSignupPort } from '../domain/ports.js';

export class GrantSignupUseCase {
  constructor(private creditRepo: CreditSignupPort) {}

  async execute(trxOrDb: unknown, userId: string): Promise<void> {
    await this.creditRepo.grantSignup(trxOrDb, userId);
  }
}
