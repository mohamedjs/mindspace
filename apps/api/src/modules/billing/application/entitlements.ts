import type { UserEntitlements } from '../domain/entities.js';
import type { BillingCachePort, BillingRepositoryPort, EntitlementsPort } from '../domain/ports.js';

export const DEFAULT_FREE_STORED_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MiB
export const DEFAULT_PAID_STORED_AUDIO_BYTES = 500 * 1024 * 1024; // 500 MiB

export interface EntitlementsOptions {
  freeStoredAudioBytes?: number;
  paidStoredAudioBytes?: number;
}

export class Entitlements implements EntitlementsPort {
  private readonly freeStoredAudioBytes: number;
  private readonly paidStoredAudioBytes: number;

  constructor(
    private readonly repo: BillingRepositoryPort,
    private readonly cache?: BillingCachePort | null,
    options?: EntitlementsOptions
  ) {
    this.freeStoredAudioBytes = options?.freeStoredAudioBytes ?? DEFAULT_FREE_STORED_AUDIO_BYTES;
    this.paidStoredAudioBytes = options?.paidStoredAudioBytes ?? DEFAULT_PAID_STORED_AUDIO_BYTES;
  }

  async forUser(userId: string): Promise<UserEntitlements> {
    if (this.cache) {
      const cached = await this.cache.getEntitlements(userId);
      if (cached) {
        return cached;
      }
    }

    const activeSub = await this.repo.getActiveSubscription(userId);
    const targetPlanId = activeSub ? activeSub.plan_id : 'free';
    const plan = await this.repo.findPlanById(targetPlanId);

    const isFreePlan = !plan || plan.price_egp === 0 || plan.id === 'free';
    const entitlements: UserEntitlements = {
      planId: plan?.id ?? 'free',
      aiEnabled: plan?.ai_enabled ?? false,
      isByok: plan?.is_byok ?? false,
      maxRecordingMinutes: plan?.max_recording_minutes ?? 5,
      maxStoredAudioBytes: isFreePlan ? this.freeStoredAudioBytes : this.paidStoredAudioBytes,
      isFreePlan,
    };

    if (this.cache) {
      await this.cache.setEntitlements(userId, entitlements);
    }

    return entitlements;
  }

  async getEntitlements(userId: string): Promise<UserEntitlements> {
    return this.forUser(userId);
  }

  async invalidateUser(userId: string): Promise<void> {
    if (this.cache) {
      await this.cache.deleteEntitlements(userId);
    }
  }
}
