import type { ActiveSubscriptionOut } from '../domain/entities.js';
import type { BillingRepositoryPort } from '../domain/ports.js';

export class GetSubscriptionUseCase {
  constructor(private readonly repo: BillingRepositoryPort) {}

  async execute(userId: string): Promise<{ subscription: ActiveSubscriptionOut | null }> {
    const subscription = await this.repo.getActiveSubscription(userId);
    return { subscription };
  }
}
