'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Home,
  Folder,
  Plus,
  Zap,
  Settings,
  Key,
  LogOut,
  Sparkles,
  X,
  ChevronRight,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { fetchSpaces, createSpace, type Space } from '@/features/canvas/api/spaces.api';
import { queryKeys } from '@/lib/query-client/keys';
import { useBalance } from '@/features/credits/hooks/useCredits';
import { useProfile } from '@/features/account/hooks/useAccount';
import { useActiveSubscription, usePlans } from '@/features/billing/hooks/useBilling';
import { useAuth } from '@/providers/AuthProvider';
import { CreateSpaceModal, getSpaceIcon } from '@/features/canvas/components/CreateSpaceModal';

interface MobileNavSheetProps {
  visible: boolean;
  onClose: () => void;
  activeSpaceId?: string | null;
}

export const MobileNavSheet: React.FC<MobileNavSheetProps> = ({
  visible,
  onClose,
  activeSpaceId,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { colors, scheme } = useTheme();
  const { user, signOut } = useAuth();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data: spaces } = useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: fetchSpaces,
    enabled: Boolean(user) && visible,
  });

  const createSpaceMutation = useMutation({
    mutationFn: ({ name, emoji }: { name: string; emoji?: string }) => createSpace(name, emoji),
    onSuccess: (space: Space) => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      toast.success('Space created');
      onClose();
      router.push(`/space/${space.id}`);
    },
  });

  const { data: balance } = useBalance();
  const { data: profile } = useProfile();
  const { data: subscription } = useActiveSubscription();
  const { data: plans } = usePlans();

  const isByok = Boolean(plans?.find((p) => p.id === subscription?.planId)?.isByok);
  const availableCredits = balance ? balance.creditsBalance - balance.creditsReserved : 0;
  const initial = (profile?.displayName?.charAt(0) || profile?.email?.charAt(0) || 'M').toUpperCase();

  if (!visible) return null;

  const handleNavigate = (path: string) => {
    onClose();
    router.push(path);
  };

  const handleSignOut = () => {
    if (confirm('Are you sure you want to sign out?')) {
      onClose();
      signOut();
    }
  };

  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 16, depth: 0.5 });

  if (typeof document === 'undefined') return null;

  // Portalled: the header is its own stacking context, which trapped this sheet under the dock.
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div
          className="w-full max-h-[88vh] flex flex-col rounded-t-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
          style={{
            backgroundColor: colors.surface,
            paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Grab Handle */}
          <div className="pt-3 pb-1 flex justify-center shrink-0">
            <div className="h-1.5 w-12 rounded-full" style={{ backgroundColor: shade(colors.surface, -0.2) }} />
          </div>

          {/* User Profile Header */}
          <div className="px-5 py-3 flex items-center justify-between border-b border-line shrink-0">
            <div className="flex items-center min-w-0 pr-3">
              <div
                className="h-11 w-11 rounded-full flex items-center justify-center font-bold text-base shrink-0"
                style={{ backgroundColor: colors.accent, color: colors.onAccent }}
              >
                {initial}
              </div>
              <div className="ml-3 min-w-0">
                <div className="text-base font-bold text-ink truncate">
                  {profile?.displayName || profile?.email || 'Account'}
                </div>
                {profile?.email && (
                  <div className="text-sm text-muted truncate">{profile.email}</div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl cursor-pointer border-0 bg-transparent text-muted hover:text-ink transition-colors"
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>

          {/* Scrollable Navigation List */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* 1. Home */}
            <div>
              <button
                type="button"
                onClick={() => handleNavigate('/')}
                className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                style={rowStyle}
              >
                <div className="flex items-center">
                  <Home size={18} color={colors.accent} className="mr-3 shrink-0" />
                  <span className="text-base font-semibold text-ink">Home</span>
                </div>
                <ChevronRight size={18} className="text-muted rtl:rotate-180" />
              </button>
            </div>

            {/* 2. Spaces */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold uppercase tracking-wider text-muted">Spaces</span>
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(true)}
                  className="min-h-[44px] px-3 py-1.5 flex items-center rounded-xl font-bold text-sm cursor-pointer border-0 transition-all"
                  style={clay({ color: colors.accent, radius: 12, depth: 0.6 })}
                >
                  <Plus size={16} color={colors.onAccent} className="mr-1" />
                  <span style={{ color: colors.onAccent }}>New space</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {spaces?.map((space) => {
                  const isActive = activeSpaceId ? activeSpaceId === space.id : pathname === `/space/${space.id}`;
                  return (
                    <button
                      key={space.id}
                      type="button"
                      onClick={() => handleNavigate(`/space/${space.id}`)}
                      className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                      style={
                        isActive
                          ? clay({ color: shade(colors.accent, scheme === 'dark' ? -0.75 : 0.8), radius: 16, depth: 0.6 })
                          : rowStyle
                      }
                    >
                      <div className="flex items-center min-w-0 pr-2">
                        <span className="mr-3 text-lg shrink-0 flex items-center justify-center">
                          {React.createElement(
                            typeof getSpaceIcon(space.emoji) === 'string'
                              ? () => <span>{space.emoji || '📌'}</span>
                              : (getSpaceIcon(space.emoji) as React.FC<any>),
                            { size: 18 }
                          )}
                        </span>
                        <span className="text-base font-semibold truncate text-ink">{space.name}</span>
                      </div>
                      <span className="text-sm text-muted shrink-0">
                        {space.noteCount} {space.noteCount === 1 ? 'note' : 'notes'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Account & Core Destinations */}
            <div className="space-y-2 pt-2 border-t border-line">
              <span className="text-sm font-bold uppercase tracking-wider text-muted block mb-2">
                Account & Billing
              </span>

              {/* Plans */}
              <button
                type="button"
                onClick={() => handleNavigate('/plans')}
                className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                style={rowStyle}
              >
                <div className="flex items-center">
                  <Sparkles size={18} className="mr-3 text-amber-500 shrink-0" />
                  <span className="text-base font-semibold text-ink">Plans</span>
                </div>
                <ChevronRight size={18} className="text-muted rtl:rotate-180" />
              </button>

              {/* Credits */}
              <button
                type="button"
                onClick={() => handleNavigate('/credits')}
                className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                style={rowStyle}
              >
                <div className="flex items-center">
                  <Zap size={18} color={colors.accent} className="mr-3 shrink-0" />
                  <span className="text-base font-semibold text-ink">Credits & billing</span>
                </div>
                <div className="flex items-center">
                  <span className="text-sm font-bold mr-2" style={{ color: colors.accent }}>
                    {availableCredits}
                  </span>
                  <ChevronRight size={18} className="text-muted rtl:rotate-180" />
                </div>
              </button>

              {/* API Keys (BYOK only) */}
              {isByok && (
                <button
                  type="button"
                  onClick={() => handleNavigate('/keys')}
                  className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                  style={rowStyle}
                >
                  <div className="flex items-center">
                    <Key size={18} className="mr-3 text-muted shrink-0" />
                    <span className="text-base font-semibold text-ink">Your API keys</span>
                  </div>
                  <ChevronRight size={18} className="text-muted rtl:rotate-180" />
                </button>
              )}

              {/* Settings */}
              <button
                type="button"
                onClick={() => handleNavigate('/settings')}
                className="w-full min-h-[48px] flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer border-0 text-left transition-all"
                style={rowStyle}
              >
                <div className="flex items-center">
                  <Settings size={18} className="mr-3 text-muted shrink-0" />
                  <span className="text-base font-semibold text-ink">Settings</span>
                </div>
                <ChevronRight size={18} className="text-muted rtl:rotate-180" />
              </button>

              {/* Sign out */}
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full min-h-[48px] flex items-center justify-center px-4 py-3 rounded-2xl cursor-pointer border-0 transition-all mt-3"
                style={rowStyle}
              >
                <LogOut size={18} className="mr-2 text-red-500" />
                <span className="text-base font-semibold text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <CreateSpaceModal
        visible={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={(name, iconId) => {
          createSpaceMutation.mutate({ name, emoji: iconId });
          setCreateModalOpen(false);
        }}
        isSubmitting={createSpaceMutation.isPending}
      />
    </>,
    document.body
  );
};
