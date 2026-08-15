import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import { fetchBalance, fetchLedger } from '../api/credits.api';

/** 10 credits = 1 EGP */
const CREDITS_PER_EGP = 10;
/** ~8 credits buys a minute of transcription at default rates */
const CREDITS_PER_MINUTE = 8;

export function useBalance() {
  return useQuery({
    queryKey: queryKeys.credits.balance,
    queryFn: fetchBalance,
  });
}

export function useLedger(limit = 50) {
  return useQuery({
    queryKey: queryKeys.credits.ledger,
    queryFn: () => fetchLedger(limit),
  });
}

export function creditsToEgp(credits: number): number {
  return Math.floor(credits / CREDITS_PER_EGP);
}

export function formatCredits(credits: number): string {
  return `${credits} credits · ${creditsToEgp(credits)} EGP`;
}

export function estimateMinutes(credits: number): number {
  return Math.floor(credits / CREDITS_PER_MINUTE);
}
