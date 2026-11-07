export const PAYMENT_CHANNELS = ['google_pay', 'apple_pay', 'instapay', 'test_pay'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const SUBSCRIPTION_STATUSES = ['pending', 'active', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string | null;
  price_egp: number;
  base_credits: number;
  bonus_pct: number;
  total_credits: number;
  is_featured: boolean;
  enabled: boolean;
  sort_order: number;
  max_recording_minutes: number;
  is_byok: boolean;
  ai_enabled: boolean;
}

export interface SubscriptionPlanOut {
  id: string;
  name: string;
  tagline: string | null;
  price_egp: number;
  total_credits: number;
  bonus_pct: number;
  is_featured: boolean;
  max_recording_minutes: number;
  is_byok: boolean;
  ai_enabled: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  channel: PaymentChannel;
  external_ref: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  cancelled_at: string | null;
}

export interface ActiveSubscriptionOut {
  id: string;
  plan_id: string;
  status: SubscriptionStatus;
  channel: PaymentChannel;
  current_period_end: string | null;
}

export interface UserEntitlements {
  planId: string;
  aiEnabled: boolean;
  isByok: boolean;
  maxRecordingMinutes: number;
  maxStoredAudioBytes: number;
  isFreePlan: boolean;
}

export interface ChargeInput {
  userId: string;
  planId: string;
  amountEgp: number;
  /** Our own id for this attempt; providers echo it back where they can. */
  reference: string;
}

export interface ChargeIntent {
  channel: PaymentChannel;
  reference: string;
  amountEgp: number;
  payload: Record<string, unknown>;
}

export interface VerifyInput {
  reference: string;
  amountEgp: number;
  receipt: unknown;
}

export type VerificationResult =
  | { status: 'verified'; externalRef: string; amountEgp: number; raw: unknown }
  | { status: 'failed'; reason: string };

export interface ProviderSummary {
  channel: PaymentChannel;
  displayName: string;
  isConfigured: boolean;
}

export interface StartSubscriptionResult {
  subscriptionId: string;
  reference?: string;
  free?: boolean;
  plan: {
    id: string;
    name: string;
    priceEgp: number;
    credits: number;
  };
  intent?: ChargeIntent;
}

export interface ConfirmSubscriptionResult {
  subscriptionId: string;
  status: 'active';
  plan?: {
    id: string;
    name: string;
  };
  creditsGranted: number;
  alreadyActive?: boolean;
}

export interface ExpireSubscriptionsResult {
  expiredCount: number;
  affectedUserIds: string[];
}
