import type { CreditBalance, LedgerEntry } from '../../core/domain';
import type { CreditRepository } from '../../core/ports';
import { apiFetch } from './client';
import { toLedgerEntry } from './mappers';

export const apiCreditRepository: CreditRepository = {
  async getBalance(): Promise<CreditBalance> {
    const data = await apiFetch<{ credits_balance: number; credits_reserved: number }>(
      '/credits/balance'
    );
    return {
      creditsBalance: data.credits_balance,
      creditsReserved: data.credits_reserved,
    };
  },

  async listLedger(limit = 50, offset = 0): Promise<LedgerEntry[]> {
    const data = await apiFetch<Record<string, unknown>[]>(
      `/credits/ledger?limit=${limit}&offset=${offset}`
    );
    return (data ?? []).map(toLedgerEntry);
  },
};
