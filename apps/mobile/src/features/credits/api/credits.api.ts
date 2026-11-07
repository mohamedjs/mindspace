import type { CreditBalance, LedgerEntry } from '../../../core/domain';
import { container } from '../../../infrastructure/container';

export type { CreditBalance, LedgerEntry };

export const fetchBalance = () => container.credits.getBalance();
export const fetchLedger = (limit = 50, offset = 0) =>
  container.credits.listLedger(limit, offset);
