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
  reference: string;
  plan: { id: string; name: string; priceEgp: number; credits: number };
  intent: ChargeIntent;
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
    .select('id, name, tagline, price_egp, total_credits, bonus_pct, is_featured')
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

export function startSubscription(planId: string, channel: PaymentChannel) {
  return invoke<StartResult>('subscribe-start', { body: { planId, channel } });
}

export function confirmSubscription(subscriptionId: string, receipt: unknown) {
  return invoke<ConfirmResult>('subscribe-confirm', { body: { subscriptionId, receipt } });
}
