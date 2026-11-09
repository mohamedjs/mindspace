'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useActiveSubscription, usePlans } from '@/features/billing/hooks/useBilling';
import { useDeleteUserKey, useSaveUserKey, useUserKeys } from '@/features/byok/hooks/useUserKeys';
import type { UserKey } from '@/features/byok/api/keys.api';
import { useTheme } from '@/shared/theme';
import { clay, clayAccent, shade } from '@/shared/theme/clay';
import { AppHeader } from '@/components/AppHeader';

const PROVIDERS = [
  { id: 'openai', label: 'OpenAI · GPT' },
  { id: 'anthropic', label: 'Anthropic · Claude' },
  { id: 'google', label: 'Google · Gemini' },
] as const;

function KeyRow({ item, onDelete }: { item: UserKey; onDelete: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <div
      className="mb-4 p-4 rounded-2xl"
      style={clay({ color: colors.surface, radius: 24, depth: 0.5 })}
    >
      <div className="flex flex-row items-center justify-between">
        <div className="text-base font-bold text-ink">
          {item.provider}
          {item.label ? ` · ${item.label}` : ''}
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirm('Remove key? Requests will go back to using MindSpace credits.')) {
              onDelete(item.id);
            }
          }}
          className="cursor-pointer border-0 bg-transparent min-h-[44px] flex items-center"
        >
          <div
            style={clay({ color: shade(colors.surface, -0.05), radius: 8, pressed: true })}
            className="px-3 py-2 min-h-[44px] flex items-center justify-center"
          >
            <span className="text-sm font-semibold" style={{ color: '#E53935' }}>
              Remove
            </span>
          </div>
        </button>
      </div>
      <div className="mt-2 text-sm font-medium text-muted">
        {item.keyHint}
      </div>
      {!item.isActive && (
        <div className="mt-2 text-sm font-semibold text-warning">
          Provider rejected this key{item.lastError ? `: ${item.lastError}` : ''} — replace it below.
        </div>
      )}
    </div>
  );
}

export default function KeysPage() {
  const router = useRouter();
  const { data: keys, isLoading } = useUserKeys();
  const saveKey = useSaveUserKey();
  const deleteKey = useDeleteUserKey();
  const { colors } = useTheme();

  const { data: subscription, isLoading: subLoading } = useActiveSubscription();
  const { data: plans } = usePlans();
  const isByok = Boolean(plans?.find((p) => p.id === subscription?.planId)?.isByok);

  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]['id']>('openai');
  const [apiKey, setApiKey] = useState('');

  if (!subLoading && plans && !isByok) {
    router.replace('/plans');
    return null;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error('Enter a key', { description: 'Paste your API key first.' });
      return;
    }
    try {
      await saveKey.mutateAsync({ provider, apiKey: apiKey.trim() });
      setApiKey('');
      toast.success('Key saved', {
        description: `Requests to ${provider} will use your own key from now on.`,
      });
    } catch (err) {
      toast.error('Could not save key', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-board overflow-y-auto">
      <AppHeader
        title="Your API keys"
        showBack
        onBack={() => router.back()}
      />
      <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pb-12">
        <div className="px-5 py-6">
          <p className="text-sm font-medium leading-relaxed text-muted">
            Your key turns transcripts into sticky notes, billed by your provider — not in
            credits. Once saved it never leaves the server and never appears here again.
          </p>

          <div
            className="mt-4 px-4 py-3 rounded-2xl"
            style={clay({ color: shade(colors.surface, -0.05), radius: 16, depth: 0.4 })}
          >
            <div className="text-sm font-bold text-ink">Voice still runs on credits</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Turning your voice into text always uses our OpenRouter key, so your plan includes
              credits for it. Your own key is only ever used for the writing.
            </p>
          </div>

          <div className="mb-3 mt-8 text-sm font-bold uppercase tracking-wider text-muted">
            Provider
          </div>
          <div className="flex flex-row flex-wrap gap-2.5">
            {PROVIDERS.map((p) => {
              const isSelected = provider === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className="px-4 py-2 min-h-[44px] flex items-center justify-center cursor-pointer border-0 transition-all"
                  style={clay({
                    color: isSelected ? `${colors.accent}20` : shade(colors.surface, -0.02),
                    radius: 16,
                    pressed: isSelected,
                    depth: isSelected ? 0.5 : 0.2,
                  })}
                  onClick={() => setProvider(p.id)}
                >
                  <span
                    className="text-sm font-bold"
                    style={{ color: isSelected ? colors.accent : colors.muted }}
                  >
                    {p.label}
                  </span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSave} className="mt-6 flex flex-col gap-4">
            <input
              type="password"
              className="w-full px-5 py-4 text-base font-medium text-ink outline-none placeholder:text-muted"
              style={clay({ color: shade(colors.surface, -0.03), radius: 20, pressed: true })}
              placeholder={`Paste your ${provider} API key`}
              autoCapitalize="none"
              autoCorrect="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={saveKey.isPending}
            />

            <button
              type="submit"
              className="w-full min-h-[48px] flex items-center justify-center py-4 cursor-pointer border-0 font-bold text-base text-on-accent transition-all disabled:opacity-50"
              style={clayAccent(colors, 20)}
              disabled={saveKey.isPending}
            >
              {saveKey.isPending ? (
                <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${colors.onAccent} transparent ${colors.onAccent} ${colors.onAccent}` }} />
              ) : (
                'Save key'
              )}
            </button>
          </form>

          <div className="mb-4 mt-10 text-sm font-bold uppercase tracking-wider text-muted">
            Saved keys
          </div>
          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted animate-pulse">Loading keys…</div>
          ) : keys?.length ? (
            keys.map((k) => <KeyRow key={k.id} item={k} onDelete={(id) => deleteKey.mutate(id)} />)
          ) : (
            <div className="text-sm font-medium text-muted">
              No keys saved yet. Everything runs on MindSpace credits.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
