import type { SubscriptionPlanOut } from '../domain/entities.js';
import type { BillingCachePort, BillingRepositoryPort } from '../domain/ports.js';

export class ListPlansUseCase {
  constructor(
    private readonly repo: BillingRepositoryPort,
    private readonly cache?: BillingCachePort | null
  ) {}

  async execute(): Promise<{ plans: SubscriptionPlanOut[] }> {
    if (this.cache) {
      const cached = await this.cache.getPlans();
      if (cached) {
        return { plans: cached };
      }
    }

    const plans = await this.repo.listEnabledPlans();
    if (this.cache) {
      await this.cache.setPlans(plans);
    }
    return { plans };
  }
}
