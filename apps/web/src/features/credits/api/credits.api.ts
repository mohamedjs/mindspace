import type { CreditBalance, LedgerEntry } from '../../../core/domain';
import { supabaseContainer } from '../../../infrastructure/container';

export type { CreditBalance, LedgerEntry };

export const fetchBalance = () => supabaseContainer.credits.getBalance();
export const fetchLedger = (limit = 50, offset = 0) =>
  supabaseContainer.credits.listLedger(limit, offset);
