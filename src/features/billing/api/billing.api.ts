import { supabase } from '../../../lib/supabase/client';

export type PaymentChannel = 'google_pay' | 'apple_pay' | 'instapay' | 'test_pay';

export interface SubscriptionPlan {
  id: string;
  name: string;
  tagline: string | null;
  priceEgp: number;
  totalCredits: number;
  bonusPct: number;
  isFeatured: boolean;
  /** Longest single recording this plan allows. */
  maxRecordingMinutes: number;
  /** "Your AI": no credits, no payment — unlocks running on the user's own key. */
  isByok: boolean;
}

/**
 * Roughly how long you can talk on a given number of credits.
 *
 * Derived from what a recording actually costs: transcription is 6 credits a
 * minute and extraction is a flat 8 per recording, so the real rate depends on
 * how long each recording is. Assuming a typical few-minute recording lands
 * around 9 credits a minute — deliberately conservative, since advertising
 * more hours than a plan delivers is a refund conversation.
 */
const CREDITS_PER_RECORDED_MINUTE = 9;

export function creditsToRecordingLabel(credits: number): string {
  const minutes = Math.floor(credits / CREDITS_PER_RECORDED_MINUTE);
  if (minutes < 90) return `about ${minutes} min of talking`;
  return `about ${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours of talking`;
}

export interface ActiveSubscription {
  id: string;
  planId: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
  channel: PaymentChannel;
  currentPeriodEnd: string | null;
}

export interface ProviderOption {
  channel: PaymentChannel;
  displayName: string;
  /** False when this deployment has no credentials — shown but not tappable. */
  isConfigured: boolean;
}

export interface ChargeIntent {
  channel: PaymentChannel;
  reference: string;
  amountEgp: number;
  payload: Record<string, unknown>;
}

export interface StartResult {
  subscriptionId: string;
  reference?: string;
  plan: { id: string; name: string; priceEgp: number; credits: number };
  /** Absent on a free plan, which subscribe-start activates outright. */
  intent?: ChargeIntent;
  free?: boolean;
}

export interface ConfirmResult {
  subscriptionId: string;
  status: string;
  creditsGranted: number;
  alreadyActive?: boolean;
}

/** Unwraps the real error out of FunctionsHttpError, same as pipeline.ts. */
async function invoke<T>(name: string, options: Parameters<typeof supabase.functions.invoke>[1]) {
  const { data, error } = await supabase.functions.invoke(name, options);

  if (error) {
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      const detail = await res.json().catch(() => null);
      if (detail?.error) {
        throw new Error(detail.reason ?? detail.message ?? detail.error);
      }
    }
    throw error;
  }

  if (data?.error) throw new Error(data.reason ?? data.message ?? data.error);
  return data as T;
}

export async function fetchPlans(): Promise<SubscriptionPlan[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select(
      'id, name, tagline, price_egp, total_credits, bonus_pct, is_featured, max_recording_minutes, is_byok'
    )
    .eq('enabled', true)
    .order('sort_order');

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    tagline: row.tagline,
    priceEgp: row.price_egp,
    totalCredits: row.total_credits,
    bonusPct: row.bonus_pct,
    isFeatured: row.is_featured,
    maxRecordingMinutes: row.max_recording_minutes,
    isByok: row.is_byok,
  }));
}

export async function fetchActiveSubscription(): Promise<ActiveSubscription | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, plan_id, status, channel, current_period_end')
    .eq('user_id', auth.user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    planId: data.plan_id,
    status: data.status,
    channel: data.channel,
    currentPeriodEnd: data.current_period_end,
  };
}

/** Which channels this deployment can actually take money through. */
export async function fetchProviders(): Promise<ProviderOption[]> {
  const result = await invoke<{ providers: ProviderOption[] }>('subscribe-start', {
    method: 'GET',
  });
  return result.providers;
}

export function startSubscription(planId: string, channel?: PaymentChannel) {
  return invoke<StartResult>('subscribe-start', { body: { planId, channel: channel ?? null } });
}

export function confirmSubscription(subscriptionId: string, receipt: unknown) {
  return invoke<ConfirmResult>('subscribe-confirm', { body: { subscriptionId, receipt } });
}
