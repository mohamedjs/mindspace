'use client';

import React, { useEffect, useRef } from 'react';
import { Smartphone, Apple, Wallet, FlaskConical, type LucideIcon } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';
import type { PaymentChannel, ProviderOption, SubscriptionPlan } from '../api/billing.api';

interface PaymentMethodSheetProps {
  visible: boolean;
  plan: SubscriptionPlan | null;
  providers: ProviderOption[] | undefined;
  busyChannel: PaymentChannel | null;
  onPick: (channel: PaymentChannel) => void;
  onClose: () => void;
}

const CHANNEL_ICON: Record<PaymentChannel, LucideIcon> = {
  google_pay: Smartphone,
  apple_pay: Apple,
  instapay: Wallet,
  test_pay: FlaskConical,
};

export const PaymentMethodSheet: React.FC<PaymentMethodSheetProps> = ({
  visible,
  plan,
  providers,
  busyChannel,
  onPick,
  onClose,
}) => {
  const { colors } = useTheme();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (visible) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <dialog
      ref={dialogRef}
      className="backdrop:bg-black/65 bg-transparent border-0 p-0 m-0 w-full max-w-lg md:m-auto fixed inset-x-0 bottom-0 md:inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
      onCancel={onClose}
    >
      <div
        className="w-full px-5 pb-10 pt-4 rounded-t-3xl md:rounded-3xl shadow-2xl"
        style={claySurface(colors, 32)}
      >
        <div
          className="mb-5 h-1.5 w-12 mx-auto rounded-full"
          style={{ backgroundColor: shade(colors.surface, -0.18) }}
        />

        <h3 className="text-xl font-bold text-ink">How would you like to pay?</h3>
        {plan && (
          <p className="mb-5 mt-1 text-sm text-muted">
            {plan.name} · {plan.priceEgp} EGP a month ·{' '}
            {plan.totalCredits.toLocaleString()} credits
          </p>
        )}

        {!providers && (
          <div className="py-6 text-center text-sm text-muted animate-pulse">Loading payment methods…</div>
        )}

        {providers?.map((provider) => {
          const Icon = CHANNEL_ICON[provider.channel];
          const busy = busyChannel === provider.channel;
          const usable = provider.isConfigured && !busyChannel;

          return (
            <button
              key={provider.channel}
              type="button"
              className="mb-2.5 w-full min-h-[48px] flex flex-row items-center px-4 py-3.5 cursor-pointer border-0 text-left transition-all disabled:opacity-50 disabled:cursor-default"
              style={clay({
                color: shade(colors.surface, -0.05),
                radius: 18,
                depth: provider.isConfigured ? 0.6 : 0.2,
              })}
              disabled={!usable}
              onClick={() => onPick(provider.channel)}
            >
              <Icon
                size={22}
                color={provider.isConfigured ? colors.ink : colors.muted}
                strokeWidth={2.2}
              />
              <div className="ml-3 flex-1">
                <div
                  className="text-base font-semibold"
                  style={{ color: provider.isConfigured ? colors.ink : colors.muted }}
                >
                  {provider.displayName}
                </div>
                {!provider.isConfigured && (
                  <div className="mt-0.5 text-sm text-muted">Not available yet</div>
                )}
              </div>
              {busy && (
                <div
                  className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin shrink-0"
                  style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </dialog>
  );
};
