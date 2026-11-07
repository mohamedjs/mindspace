export const LEDGER_REASONS = [
  'signup_grant',
  'monthly_refill',
  'purchase',
  'usage',
  'refund',
  'reversal',
  'admin_adjust',
] as const;

export type LedgerReason = (typeof LEDGER_REASONS)[number];

export interface CreditBalance {
  credits_balance: number;
  credits_reserved: number;
}

export type ReservationStatus = 'held' | 'settled' | 'released';

export interface CreditLedgerEntry {
  id: number;
  delta: number;
  balance_after: number;
  reason: LedgerReason;
  created_at: string;
}

export interface CreditPackage {
  id: string;
  name: string;
  price_egp: number;
  base_credits: number;
  bonus_pct: number;
  total_credits: number;
  is_featured: boolean;
  store_product_id_ios: string | null;
  store_product_id_android: string | null;
  sort_order: number;
}

export interface GrantCreditsOptions {
  packageId?: string | null;
  paymentRef?: string | null;
  meta?: Record<string, unknown> | null;
}

export interface SweepResult {
  releasedCount: number;
  affectedUserIds: string[];
}
