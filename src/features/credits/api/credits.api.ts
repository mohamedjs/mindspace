import { supabase } from '../../../lib/supabase/client';

export interface CreditBalance {
  creditsBalance: number;
  creditsReserved: number;
}

export interface LedgerEntry {
  id: number;
  delta: number;
  balanceAfter: number;
  reason: string;
  createdAt: string;
}

export async function fetchBalance(): Promise<CreditBalance> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not_authenticated');

  const { data, error } = await supabase
    .from('profiles')
    .select('credits_balance, credits_reserved')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    creditsBalance: data.credits_balance,
    creditsReserved: data.credits_reserved,
  };
}

export async function fetchLedger(limit = 50, offset = 0): Promise<LedgerEntry[]> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('not_authenticated');

  const { data, error } = await supabase
    .from('credit_ledger')
    .select('id, delta, balance_after, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    delta: row.delta,
    balanceAfter: row.balance_after,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}
