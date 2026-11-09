'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { creditsToEgp, estimateMinutes, useBalance, useLedger } from '@/features/credits/hooks/useCredits';
import type { LedgerEntry } from '@/features/credits/api/credits.api';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/shared/theme';
import { clay } from '@/shared/theme/clay';
import { AppHeader } from '@/components/AppHeader';

const REASON_LABELS: Record<string, string> = {
  signup_grant: 'Welcome bonus',
  free_refill: 'Free refill',
  purchase: 'Credits purchased',
  transcribe: 'Transcription',
  extract: 'AI extraction',
  refund: 'Refund',
};

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.delta > 0;
  const date = new Date(entry.createdAt).toLocaleDateString();

  return (
    <div className="flex flex-row items-center justify-between border-b px-5 py-3 border-line min-h-[48px]">
      <div className="flex-1">
        <div className="text-sm font-semibold text-ink">
          {REASON_LABELS[entry.reason] ?? entry.reason}
        </div>
        <div className="mt-0.5 text-sm text-muted">
          {date}
        </div>
      </div>
      <div className="text-right">
        <div
          className="text-sm font-bold"
          style={{ color: isCredit ? '#4CAF50' : '#E53935' }}
        >
          {isCredit ? '+' : ''}
          {entry.delta}
        </div>
        <div className="mt-0.5 text-sm text-muted">
          {entry.balanceAfter}
        </div>
      </div>
    </div>
  );
}

export default function CreditsPage() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: balance, isLoading: balanceLoading } = useBalance();
  const { data: ledger, isLoading: ledgerLoading } = useLedger();
  const { colors } = useTheme();

  const available = balance ? balance.creditsBalance - balance.creditsReserved : 0;

  const handleSignOut = () => {
    if (confirm('Sign out?')) {
      signOut();
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-board overflow-y-auto">
      <AppHeader
        title="Credits & billing"
        showBack
        onBack={() => router.back()}
        actions={
          <button
            type="button"
            onClick={handleSignOut}
            className="min-h-[44px] px-2 text-sm font-semibold text-muted cursor-pointer border-0 bg-transparent flex items-center"
          >
            Sign out
          </button>
        }
      />
      <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pb-12">
        {/* Balance Card */}
        <div
          className="m-5 p-6"
          style={clay({ color: colors.surface, radius: 32, depth: 0.5 })}
        >
          {balanceLoading ? (
            <div className="py-4 text-center text-sm text-muted animate-pulse">Loading balance…</div>
          ) : (
            <>
              <div className="text-sm font-bold uppercase tracking-wider text-muted">
                Available balance
              </div>
              <div className="mt-2 text-5xl font-bold text-ink">{available}</div>
              <div className="mt-1 text-sm font-medium text-muted">
                {creditsToEgp(available)} EGP · about {estimateMinutes(available)} min of voice
              </div>
              <button
                type="button"
                className="mt-4 cursor-pointer border-0 bg-transparent p-0 min-h-[44px] flex items-center"
                onClick={() => router.push('/plans')}
              >
                <div style={clay({ color: colors.accent, radius: 12, depth: 0.7 })} className="px-4 py-2.5 min-h-[44px] flex items-center justify-center">
                  <span className="text-sm font-bold" style={{ color: colors.onAccent }}>
                    Get monthly credits →
                  </span>
                </div>
              </button>

              {Boolean(balance?.creditsReserved) && (
                <div className="mt-3 text-sm font-semibold text-warning">
                  {balance?.creditsReserved} credits reserved for in-flight work
                </div>
              )}
            </>
          )}
        </div>

        {/* Ledger */}
        <div className="px-5 pb-2 text-sm uppercase font-bold text-muted">
          History
        </div>
        {ledgerLoading ? (
          <div className="py-6 text-center text-sm text-muted animate-pulse">Loading history…</div>
        ) : (
          <div className="divide-y divide-line">
            {ledger?.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted">
                No credit activity yet.
              </div>
            ) : (
              ledger?.map((item) => <LedgerRow key={item.id} entry={item} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
