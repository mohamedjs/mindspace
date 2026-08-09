import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './auth.ts';

/**
 * reserve_credits/settle_credits/release_credits read auth.uid(), so they must
 * be called with the caller's JWT client — not the service-role client.
 */
export async function reserveCredits(
  db: SupabaseClient,
  amount: number,
  reason = 'usage'
): Promise<string> {
  const { data, error } = await db.rpc('reserve_credits', {
    p_amount: amount,
    p_reason: reason,
  });

  if (error) {
    if (error.message?.includes('INSUFFICIENT_CREDITS')) {
      throw new HttpError(402, 'insufficient_credits', error.message);
    }
    throw new HttpError(500, 'reserve_failed', error.message);
  }

  return data as string;
}

export async function settleCredits(
  db: SupabaseClient,
  reservationId: string,
  actual: number,
  aiActionId: string | null = null
): Promise<number> {
  const { data, error } = await db.rpc('settle_credits', {
    p_reservation: reservationId,
    p_actual: actual,
    p_ai_action: aiActionId,
  });

  if (error) throw new HttpError(500, 'settle_failed', error.message);
  return data as number;
}

/** Best-effort — never let a release failure mask the original error. */
export async function releaseCredits(db: SupabaseClient, reservationId: string): Promise<void> {
  const { error } = await db.rpc('release_credits', { p_reservation: reservationId });
  if (error) console.error('[credits] release failed', reservationId, error.message);
}
