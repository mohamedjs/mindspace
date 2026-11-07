import { type Clock, systemClock } from '../../../platform/clock.js';
import type { ExpireSubscriptionsResult } from '../domain/entities.js';
import type { BillingRepositoryPort, EntitlementsPort } from '../domain/ports.js';

export class ExpireSubscriptionsUseCase {
  constructor(
    private readonly repo: BillingRepositoryPort,
    private readonly entitlements: EntitlementsPort,
    private readonly clock: Clock = systemClock
  ) {}

  async execute(now?: Date, tx?: unknown): Promise<ExpireSubscriptionsResult> {
    const result = await this.repo.expireDueSubscriptions(now ?? this.clock.now(), tx);
    for (const userId of result.affectedUserIds) {
      await this.entitlements.invalidateUser(userId);
    }
    return result;
  }
}
