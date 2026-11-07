import type { Cache } from '../../../platform/cache.js';
import type { SubscriptionPlanOut, UserEntitlements } from '../domain/entities.js';
import type { BillingCachePort } from '../domain/ports.js';

export const PLANS_CACHE_KEY = 'cache:plans';
export const PLANS_CACHE_TTL_SECONDS = 300; // 5 minutes
export const ENTITLEMENTS_CACHE_TTL_SECONDS = 60; // 60 seconds

export function entitlementsCacheKey(userId: string): string {
  return `cache:entitlements:${userId}`;
}

export class RedisBillingCache implements BillingCachePort {
  constructor(private readonly cache: Cache) {}

  async getPlans(): Promise<SubscriptionPlanOut[] | null> {
    try {
      const raw = await this.cache.get(PLANS_CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SubscriptionPlanOut[];
    } catch {
      return null;
    }
  }

  async setPlans(plans: SubscriptionPlanOut[]): Promise<void> {
    try {
      await this.cache.set(
        PLANS_CACHE_KEY,
        JSON.stringify(plans),
        'EX',
        PLANS_CACHE_TTL_SECONDS
      );
    } catch {
      // Fall through silently when Redis is down
    }
  }

  async getEntitlements(userId: string): Promise<UserEntitlements | null> {
    try {
      const raw = await this.cache.get(entitlementsCacheKey(userId));
      if (!raw) return null;
      return JSON.parse(raw) as UserEntitlements;
    } catch {
      return null;
    }
  }

  async setEntitlements(userId: string, entitlements: UserEntitlements): Promise<void> {
    try {
      await this.cache.set(
        entitlementsCacheKey(userId),
        JSON.stringify(entitlements),
        'EX',
        ENTITLEMENTS_CACHE_TTL_SECONDS
      );
    } catch {
      // Fall through silently when Redis is down
    }
  }

  async deleteEntitlements(userId: string): Promise<void> {
    try {
      await this.cache.del(entitlementsCacheKey(userId));
    } catch {
      // Fall through silently when Redis is down
    }
  }
}
