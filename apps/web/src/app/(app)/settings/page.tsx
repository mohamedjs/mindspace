'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ModelPicker } from '@/features/ai/components/ModelPicker';
import {
  useModelPreferences,
  useModels,
  useSetModelPreference,
} from '@/features/ai/hooks/useModels';
import { useDeleteAccount, useProfile, useUpdateDisplayName } from '@/features/account/hooks/useAccount';
import { useActiveSubscription, usePlans } from '@/features/billing/hooks/useBilling';
import { useUserKeys } from '@/features/byok/hooks/useUserKeys';
import { ThemeToggle } from '@/shared/theme/ThemeToggle';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { useAuth } from '@/providers/AuthProvider';
import { Check, ChevronLeft, LogOut, Pencil, Trash2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';

function SectionDot({ color }: { color: string }) {
  return <span className="mr-2 h-2 w-2 rounded-full inline-block" style={{ backgroundColor: color }} />;
}

function SectionHeading({ dot, children }: { dot: string; children: string }) {
  return (
    <div className="mb-3 flex flex-row items-center">
      <SectionDot color={dot} />
      <span className="text-sm uppercase font-bold text-muted">{children}</span>
    </div>
  );
}

function ProfileCard() {
  const { colors } = useTheme();
  const { data: profile, isLoading } = useProfile();
  const updateName = useUpdateDisplayName();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const label = profile?.displayName?.trim() || profile?.email || '';
  const initial = label.charAt(0).toUpperCase() || '?';

  const startEditing = () => {
    setName(profile?.displayName ?? '');
    setEditing(true);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateName.mutate(trimmed, {
      onSuccess: () => setEditing(false),
      onError: (err) => toast.error('Could not save name', { description: err.message }),
    });
  };

  return (
    <div className="mb-6 flex flex-row items-center p-5" style={clay({ color: colors.surface, radius: 28, depth: 0.6 })}>
      <div
        className="mr-4 h-14 w-14 flex items-center justify-center shrink-0"
        style={clay({ color: shade(colors.accent, 0.1), radius: 28, depth: 0.4 })}
      >
        <span className="text-xl font-bold" style={{ color: colors.onAccent }}>
          {initial}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        {isLoading ? (
          <div
            className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
          />
        ) : editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="flex flex-row items-center"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
              className="mr-2 flex-1 text-base font-bold text-ink bg-transparent border-0 outline-none p-0"
            />
            <button type="submit" disabled={updateName.isPending} className="cursor-pointer border-0 bg-transparent">
              <Check size={20} color={colors.accent} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="flex flex-row items-center text-left cursor-pointer border-0 bg-transparent p-0 min-h-[44px]"
            onClick={startEditing}
          >
            <span className="text-base font-bold text-ink truncate">{label || 'Add your name'}</span>
            <Pencil size={14} color={colors.muted} strokeWidth={2.5} className="ml-2 shrink-0" />
          </button>
        )}
        {profile?.email && <div className="mt-0.5 text-sm text-muted truncate">{profile.email}</div>}
      </div>
    </div>
  );
}

const PROVIDER_LABEL: Record<string, string> = {
  openai: 'GPT',
  anthropic: 'Claude',
  google: 'Gemini',
};

function AiModelsSection() {
  const { data: models } = useModels();
  const { data: prefs } = useModelPreferences();
  const { data: keys } = useUserKeys();
  const setPreference = useSetModelPreference();

  const choose = (kind: 'chat' | 'transcribe') => (modelRowId: string | null) =>
    setPreference.mutate(
      { kind, modelRowId },
      { onError: (err) => toast.error('Could not save', { description: err.message }) }
    );

  const keyProviders = (keys ?? []).filter((k) => k.isActive).map((k) => k.provider);
  const chatModels = keyProviders.length
    ? models?.filter((m) => keyProviders.includes(m.provider))
    : models?.filter((m) => m.provider === 'openrouter');

  const ownProviders = keyProviders.map((p) => PROVIDER_LABEL[p] ?? p).join(' · ');

  return (
    <>
      <SectionHeading dot="#66BB6A">AI models</SectionHeading>

      <ModelPicker
        title="Text → sticky notes"
        subtitle={
          keyProviders.length
            ? `Running on your own ${ownProviders} key — billed by them, not in credits.`
            : 'Which model reads the transcript and decides what the notes say.'
        }
        kind="chat"
        models={chatModels}
        selectedId={prefs?.chatModelId ?? null}
        saving={setPreference.isPending}
        onSelect={choose('chat')}
      />

      <ModelPicker
        title="Voice → text"
        subtitle="Always runs on MindSpace credits, even with your own key saved."
        kind="transcribe"
        models={models}
        selectedId={prefs?.transcribeModelId ?? null}
        saving={setPreference.isPending}
        onSelect={choose('transcribe')}
      />
    </>
  );
}

function AppearanceSection() {
  const {
    colors,
    handDrawnEnabled,
    setHandDrawnEnabled,
    canvasBackgroundEnabled,
    setCanvasBackgroundEnabled,
    showChildNotes,
    setShowChildNotes,
    notesView,
    setNotesView,
    noteSize,
    setNoteSize,
  } = useTheme();
  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5 });

  return (
    <>
      <SectionHeading dot="#42A5F5">Appearance</SectionHeading>
      <div className="mb-3">
        <ThemeToggle />
      </div>

      <div className="mb-2.5 px-4 py-3.5" style={rowStyle}>
        <div className="text-base font-semibold text-ink">Sticky note size</div>
        <p className="mb-3 mt-0.5 text-sm text-muted leading-relaxed">
          Controls card dimensions and how much content text is displayed on the board.
        </p>
        <div
          className="flex flex-row p-1 gap-1"
          style={clay({ color: shade(colors.surface, -0.12), radius: 16, pressed: true })}
        >
          {(
            [
              { value: 'small', label: 'Small', desc: 'Compact' },
              { value: 'medium', label: 'Medium', desc: 'Balanced' },
              { value: 'large', label: 'Large', desc: 'Spacious' },
            ] as const
          ).map((option) => {
            const isActive = noteSize === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="flex-1 flex flex-col items-center justify-center min-h-[44px] py-1.5 px-1 cursor-pointer border-0 bg-transparent transition-all"
                style={isActive ? clay({ color: colors.accent, radius: 12, depth: 0.7 }) : undefined}
                onClick={() => setNoteSize(option.value)}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: isActive ? colors.onAccent : colors.ink }}
                >
                  {option.label}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: isActive ? colors.onAccent : colors.muted }}
                >
                  {option.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-2.5 px-4 py-3.5" style={rowStyle}>
        <div className="text-base font-semibold text-ink">Your notes as</div>
        <p className="mb-3 mt-0.5 text-sm text-muted leading-relaxed">
          A board you arrange, or a list you scroll — with its own calendar tab. Both record and
          both keep sub-notes with their parent.
        </p>
        <div
          className="flex flex-row p-1.5"
          style={clay({ color: shade(colors.surface, -0.12), radius: 16, pressed: true })}
        >
          {(
            [
              { value: 'canvas', label: 'Canvas' },
              { value: 'list', label: 'List' },
            ] as const
          ).map((option) => {
            const isActive = notesView === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="flex-1 flex items-center justify-center min-h-[44px] py-2 cursor-pointer border-0 bg-transparent transition-all"
                style={isActive ? clay({ color: colors.accent, radius: 12, depth: 0.7 }) : undefined}
                onClick={() => setNotesView(option.value)}
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: isActive ? colors.onAccent : colors.muted }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-2.5 flex flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <div className="flex-1 pr-3">
          <div className="text-base font-semibold text-ink">Hand-drawn text</div>
          <div className="mt-0.5 text-sm text-muted">Excalidraw-style font instead of system font.</div>
        </div>
        <label className="relative inline-flex items-center min-h-[44px] min-w-[44px] justify-end cursor-pointer">
          <input
            type="checkbox"
            checked={handDrawnEnabled}
            onChange={(e) => setHandDrawnEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:right-[22px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
        </label>
      </div>

      <div className="mb-2.5 flex flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <div className="flex-1 pr-3">
          <div className="text-base font-semibold text-ink">Canvas background</div>
          <div className="mt-0.5 text-sm text-muted">Grid and colour orbs, or a plain solid board.</div>
        </div>
        <label className="relative inline-flex items-center min-h-[44px] min-w-[44px] justify-end cursor-pointer">
          <input
            type="checkbox"
            checked={canvasBackgroundEnabled}
            onChange={(e) => setCanvasBackgroundEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:right-[22px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
        </label>
      </div>

      <div className="mb-6 flex flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <div className="flex-1 pr-3">
          <div className="text-base font-semibold text-ink">Sub-notes on canvas</div>
          <div className="mt-0.5 text-sm text-muted">
            Show them as connected cards, or just the idea they belong to.
          </div>
        </div>
        <label className="relative inline-flex items-center min-h-[44px] min-w-[44px] justify-end cursor-pointer">
          <input
            type="checkbox"
            checked={showChildNotes}
            onChange={(e) => setShowChildNotes(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[12px] after:right-[22px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
        </label>
      </div>
    </>
  );
}

function AccountSection() {
  const router = useRouter();
  const { signOut } = useAuth();
  const deleteAccount = useDeleteAccount();
  const { colors } = useTheme();
  const { data: subscription } = useActiveSubscription();
  const { data: plans } = usePlans();
  const isByok = Boolean(plans?.find((p) => p.id === subscription?.planId)?.isByok);
  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5 });

  const handleSignOut = () => {
    if (confirm('Are you sure you want to sign out?')) {
      signOut();
    }
  };

  const handleDeleteAccount = () => {
    if (confirm('Delete account? This permanently deletes every space, recording, and note you own. This cannot be undone.')) {
      deleteAccount.mutate(undefined, {
        onSuccess: () => signOut(),
        onError: (err) =>
          toast.error('Could not delete account', { description: err.message }),
      });
    }
  };

  return (
    <>
      <SectionHeading dot="#FFCA28">Account</SectionHeading>

      <button
        type="button"
        className="mb-2.5 w-full px-4 py-4 cursor-pointer border-0 text-left transition-all"
        style={rowStyle}
        onClick={() => router.push('/plans')}
      >
        <div className="text-base font-semibold text-ink">Plans</div>
        <div className="mt-0.5 text-sm text-muted">
          Monthly credits, longer recordings — or bring your own AI key.
        </div>
      </button>

      {isByok && (
        <button
          type="button"
          className="mb-2.5 w-full px-4 py-4 cursor-pointer border-0 text-left transition-all"
          style={rowStyle}
          onClick={() => router.push('/keys')}
        >
          <div className="text-base font-semibold text-ink">Your API keys</div>
          <div className="mt-0.5 text-sm text-muted">
            Requests run on your own provider account, not on credits.
          </div>
        </button>
      )}

      <button
        type="button"
        className="mb-2.5 w-full px-4 py-4 cursor-pointer border-0 text-left transition-all"
        style={rowStyle}
        onClick={() => router.push('/credits')}
      >
        <div className="text-base font-semibold text-ink">Credits & billing</div>
        <div className="mt-0.5 text-sm text-muted">Balance and history.</div>
      </button>

      <button
        type="button"
        className="mb-6 w-full flex flex-row items-center px-4 py-4 cursor-pointer border-0 text-left transition-all disabled:opacity-50"
        style={rowStyle}
        onClick={handleDeleteAccount}
        disabled={deleteAccount.isPending}
      >
        <Trash2 size={18} color="#E53935" strokeWidth={2.5} className="mr-2.5" />
        <span className="text-base font-semibold" style={{ color: '#E53935' }}>
          Delete account
        </span>
      </button>

      <button
        type="button"
        className="w-full flex flex-row items-center justify-center px-4 py-4 cursor-pointer border-0 text-center transition-all"
        style={rowStyle}
        onClick={handleSignOut}
      >
        <LogOut size={18} color={colors.muted} strokeWidth={2.5} className="mr-2.5" />
        <span className="text-base font-semibold text-muted">Log out</span>
      </button>
    </>
  );
}

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-board overflow-y-auto">
      <AppHeader
        title="Settings"
        showBack
        onBack={() => router.back()}
      />
      <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto pb-12">
        <div className="px-5 py-5 space-y-2">
          <ProfileCard />
          <AiModelsSection />
          <AppearanceSection />
          <AccountSection />
        </div>
      </div>
    </div>
  );
}
