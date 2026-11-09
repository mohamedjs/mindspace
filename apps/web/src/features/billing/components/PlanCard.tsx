'use client';

import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import {
  creditsToRecordingLabel,
  creditsToTranscriptionLabel,
  type SubscriptionPlan,
} from '../api/billing.api';

interface PlanCardProps {
  plan: SubscriptionPlan;
  isCurrent: boolean;
  disabled?: boolean;
  onPress: (planId: string) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({ plan, isCurrent, disabled, onPress }) => {
  const { colors, scheme } = useTheme();

  const surface = isCurrent
    ? shade(colors.accent, scheme === 'dark' ? -0.72 : 0.78)
    : shade(colors.surface, -0.05);

  return (
    <button
      type="button"
      className="mb-3 w-full px-5 py-4 cursor-pointer border-0 text-left transition-all disabled:cursor-default"
      style={clay({ color: surface, radius: 22, depth: plan.isFeatured ? 0.9 : 0.5 })}
      disabled={disabled || isCurrent}
      onClick={() => onPress(plan.id)}
    >
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-2">
          <span className="text-lg font-bold text-ink">{plan.name}</span>

          {plan.isFeatured && !isCurrent && (
            <span
              className="flex flex-row items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase"
              style={{ backgroundColor: colors.accent, color: colors.onAccent }}
            >
              <Sparkles size={12} color={colors.onAccent} strokeWidth={3} className="mr-1 inline" />
              Popular
            </span>
          )}

          {isCurrent && (
            <span className="flex flex-row items-center text-xs font-bold uppercase" style={{ color: colors.accent }}>
              <Check size={14} color={colors.accent} strokeWidth={3} className="mr-1 inline" />
              Current
            </span>
          )}
        </div>

        <div className="flex flex-row items-baseline">
          <span className="text-xl font-bold text-ink">{plan.priceEgp}</span>
          <span className="ml-1 text-sm font-semibold text-muted">EGP/mo</span>
        </div>
      </div>

      {Boolean(plan.tagline) && (
        <div className="mt-1 text-sm text-muted">{plan.tagline}</div>
      )}

      {plan.isByok ? (
        <div className="mt-3">
          <div className="text-sm font-bold" style={{ color: colors.accent }}>
            Sticky notes on your own GPT / Claude / Gemini key
          </div>
          <div className="mt-1 text-sm text-muted">
            {plan.totalCredits.toLocaleString()} credits for voice → text (
            {creditsToTranscriptionLabel(plan.totalCredits)}) · recordings up to{' '}
            {plan.maxRecordingMinutes} min
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <div className="flex flex-row items-baseline">
            <span className="text-sm font-bold" style={{ color: colors.accent }}>
              {plan.totalCredits.toLocaleString()} credits
            </span>
            <span className="ml-1.5 text-sm text-muted">a month</span>
            {plan.bonusPct > 0 && (
              <span className="ml-2 text-sm font-semibold text-warning">
                +{plan.bonusPct}% bonus
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted">
            {creditsToRecordingLabel(plan.totalCredits)} · up to{' '}
            {plan.maxRecordingMinutes} min per recording
          </div>
        </div>
      )}
    </button>
  );
};
