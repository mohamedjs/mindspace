import type {
  ActiveSubscriptionOut,
  ChargeInput,
  ChargeIntent,
  ExpireSubscriptionsResult,
  PaymentChannel,
  ProviderSummary,
  Subscription,
  SubscriptionPlan,
  SubscriptionPlanOut,
  UserEntitlements,
  VerificationResult,
  VerifyInput,
} from './entities.js';

export interface PaymentProviderPort {
  readonly channel: PaymentChannel;
  readonly displayName: string;
  readonly isConfigured: boolean;
  createCharge(input: ChargeInput): Promise<ChargeIntent>;
  verify(input: VerifyInput): Promise<VerificationResult>;
}

export interface PaymentProviderRegistryPort {
  paymentProviderFor(channel: unknown): PaymentProviderPort;
  listProviders(): ProviderSummary[];
}

export interface BillingCreditsPort {
  grant(
    userId: string,
    amount: number,
    reason: 'purchase',
    tx: unknown,
    options?: {
      paymentRef?: string | null;
      packageId?: string | null;
      meta?: Record<string, unknown> | null;
    }
  ): Promise<number>;
}

export interface BillingCachePort {
  getPlans(): Promise<SubscriptionPlanOut[] | null>;
  setPlans(plans: SubscriptionPlanOut[]): Promise<void>;
  getEntitlements(userId: string): Promise<UserEntitlements | null>;
  setEntitlements(userId: string, entitlements: UserEntitlements): Promise<void>;
  deleteEntitlements(userId: string): Promise<void>;
}

export interface BillingRepositoryPort {
  listEnabledPlans(): Promise<SubscriptionPlanOut[]>;
  findPlanById(planId: string, tx?: unknown): Promise<SubscriptionPlan | null>;
  getActiveSubscription(userId: string, tx?: unknown): Promise<ActiveSubscriptionOut | null>;
  hasActivePaidSubscription(userId: string, tx?: unknown): Promise<boolean>;
  findSubscriptionForUser(
    subscriptionId: string,
    userId: string,
    tx?: unknown,
    forUpdate?: boolean
  ): Promise<Subscription | null>;
  createFreeSubscription(input: {
    userId: string;
    planId: string;
    start: Date;
    end: Date;
  }): Promise<Subscription>;
  createPendingSubscription(input: {
    userId: string;
    planId: string;
    channel: PaymentChannel;
  }): Promise<Subscription>;
  insertVerifiedPayment(
    input: {
      userId: string;
      subscriptionId: string;
      amountEgp: number;
      channel: PaymentChannel;
      externalRef: string;
      rawReceipt: unknown;
      verifiedAt: Date;
    },
    tx: unknown
  ): Promise<{ inserted: boolean; paymentId: string | null }>;
  activateSubscription(
    input: {
      subscriptionId: string;
      userId: string;
      externalRef: string;
      currentPeriodStart: Date;
      currentPeriodEnd: Date;
    },
    tx: unknown
  ): Promise<void>;
  expireDueSubscriptions(now?: Date, tx?: unknown): Promise<ExpireSubscriptionsResult>;
  runInTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export interface EntitlementsPort {
  forUser(userId: string): Promise<UserEntitlements>;
  getEntitlements(userId: string): Promise<UserEntitlements>;
  invalidateUser(userId: string): Promise<void>;
}

export interface ConfirmStepHookPort {
  onBeforeInsertPayment?(tx: unknown): Promise<void> | void;
  onBeforeGrantCredits?(tx: unknown): Promise<void> | void;
  onBeforeActivateSubscription?(tx: unknown): Promise<void> | void;
}
