'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Zap,
  Settings,
  Key,
  LogOut,
  Sparkles,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import { fetchSpaces, createSpace, updateSpace, deleteSpace, type Space } from '@/features/canvas/api/spaces.api';
import { queryKeys } from '@/lib/query-client/keys';
import { useBalance } from '@/features/credits/hooks/useCredits';
import { useProfile } from '@/features/account/hooks/useAccount';
import { useActiveSubscription, usePlans } from '@/features/billing/hooks/useBilling';
import { useAuth } from '@/providers/AuthProvider';
import { CreateSpaceModal, getSpaceIcon } from '@/features/canvas/components/CreateSpaceModal';

const STORAGE_KEY = 'mindspace:sidebar';

export const Sidebar: React.FC = () => {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const { colors, scheme } = useTheme();
  const { user, signOut } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeSpaceMenuId, setActiveSpaceMenuId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const { data: spaces } = useQuery({
    queryKey: queryKeys.spaces.all,
    queryFn: fetchSpaces,
    enabled: Boolean(user),
  });

  const createSpaceMutation = useMutation({
    mutationFn: ({ name, emoji }: { name: string; emoji?: string }) => createSpace(name, emoji),
    onSuccess: (space: Space) => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      toast.success('Space created');
      router.push(`/space/${space.id}`);
    },
  });

  const updateSpaceMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateSpace(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      toast.success('Space renamed');
    },
  });

  const deleteSpaceMutation = useMutation({
    mutationFn: (id: string) => deleteSpace(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.spaces.all });
      toast.success('Space deleted');
      router.push('/');
    },
  });

  const { data: balance } = useBalance();
  const { data: profile } = useProfile();
  const { data: subscription } = useActiveSubscription();
  const { data: plans } = usePlans();

  const isByok = Boolean(plans?.find((p) => p.id === subscription?.planId)?.isByok);
  const availableCredits = balance ? balance.creditsBalance - balance.creditsReserved : 0;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) setIsCollapsed(saved === 'true');
    } catch {}
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const handleCreateSpace = () => {
    const name = prompt('Name your new space:');
    if (!name?.trim()) return;
    createSpaceMutation.mutate({ name: name.trim() });
  };

  const handleRenameSpaceStart = (space: Space) => {
    setRenamingSpaceId(space.id);
    setRenameValue(space.name);
    setActiveSpaceMenuId(null);
  };

  const handleRenameSpaceSubmit = () => {
    if (renamingSpaceId && renameValue.trim()) {
      updateSpaceMutation.mutate({ id: renamingSpaceId, name: renameValue.trim() });
    }
    setRenamingSpaceId(null);
  };

  const handleDeleteSpace = (spaceId: string, name: string) => {
    if (confirm(`Delete "${name}"? Notes inside will be permanently deleted.`)) {
      deleteSpaceMutation.mutate(spaceId);
    }
    setActiveSpaceMenuId(null);
  };

  const initial = (profile?.displayName?.charAt(0) || profile?.email?.charAt(0) || 'M').toUpperCase();

  return (
    <aside
      className={`hidden lg:flex flex-col h-screen shrink-0 border-r border-line transition-all duration-200 z-40 relative ${
        isCollapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
      style={{ backgroundColor: shade(colors.surface, scheme === 'dark' ? 0.02 : -0.02) }}
    >
      {/* Header */}
      <div className="h-14 px-3 flex flex-row items-center justify-between shrink-0 border-b border-line">
        {!isCollapsed && (
          <Link href="/" className="flex flex-row items-center gap-2 text-ink no-underline">
            <span className="text-lg font-bold tracking-tight">MindSpace</span>
          </Link>
        )}
        <button
          type="button"
          onClick={toggleCollapse}
          className={`h-9 w-9 flex items-center justify-center rounded-xl cursor-pointer border-0 text-muted hover:text-ink transition-colors ${
            isCollapsed ? 'mx-auto' : ''
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-h-0 px-2 py-3 overflow-y-auto">
        {/* Create Space Button */}
        <button
          type="button"
          onClick={() => setCreateModalOpen(true)}
          className={`w-full flex flex-row items-center justify-center rounded-xl p-2.5 cursor-pointer border-0 font-bold text-sm transition-all ${
            isCollapsed ? 'h-10 w-10 mx-auto' : ''
          }`}
          style={clay({ color: colors.accent, radius: 14, depth: 0.6 })}
          title="New space"
        >
          <Plus size={18} color={colors.onAccent} strokeWidth={2.5} />
          {!isCollapsed && <span className="ml-2 text-white">New space</span>}
        </button>

        {/* Spaces List */}
        {!isCollapsed && (
          <div className="mt-5 mb-2 px-2 text-[11px] font-bold uppercase tracking-wider text-muted">
            Spaces
          </div>
        )}

        <nav aria-label="Spaces" className="space-y-1 mt-1">
          {spaces?.map((space: Space) => {
            const isActive = pathname === `/space/${space.id}`;
            return (
              <div key={space.id} className="relative group">
                <Link
                  href={`/space/${space.id}`}
                  className={`flex flex-row items-center px-2.5 py-2 rounded-xl text-sm font-semibold no-underline transition-all ${
                    isCollapsed ? 'justify-center' : 'justify-between'
                  }`}
                  style={
                    isActive
                      ? clay({ color: shade(colors.accent, scheme === 'dark' ? -0.75 : 0.8), radius: 12, depth: 0.5 })
                      : { color: colors.ink }
                  }
                  title={space.name}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <div className="flex flex-row items-center min-w-0 pr-1">
                    <span className="mr-2 shrink-0 flex items-center justify-center">
                      {React.createElement(
                        typeof getSpaceIcon(space.emoji) === 'string'
                          ? () => <span>{space.emoji || '📌'}</span>
                          : (getSpaceIcon(space.emoji) as React.FC<any>),
                        { size: 16 }
                      )}
                    </span>
                    {!isCollapsed && (
                      renamingSpaceId === space.id ? (
                        <div className="flex-1 flex items-center" onClick={(e) => e.preventDefault()}>
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameSpaceSubmit();
                              if (e.key === 'Escape') setRenamingSpaceId(null);
                            }}
                            onBlur={handleRenameSpaceSubmit}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-line outline-none text-sm font-semibold"
                            style={{ color: colors.ink }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <button
                            type="button"
                            onPointerDown={(e) => { e.preventDefault(); handleRenameSpaceSubmit(); }}
                            className="ml-1 flex items-center justify-center h-6 w-6 rounded-md bg-transparent border-0 cursor-pointer text-muted hover:text-accent transition-colors"
                          >
                            <Check size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="truncate">{space.name}</span>
                      )
                    )}
                  </div>

                  {!isCollapsed && renamingSpaceId !== space.id && (
                    <div className="flex flex-row items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveSpaceMenuId(activeSpaceMenuId === space.id ? null : space.id);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-md border-0 bg-transparent text-muted hover:text-ink cursor-pointer"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  )}
                </Link>

                {/* Space context menu */}
                {activeSpaceMenuId === space.id && !isCollapsed && (
                  <div
                    className="absolute right-2 top-9 z-50 py-1 px-1 rounded-xl shadow-xl border border-line"
                    style={{ backgroundColor: colors.surface }}
                  >
                    <button
                      type="button"
                      onClick={() => handleRenameSpaceStart(space)}
                      className="w-full flex flex-row items-center px-3 py-1.5 text-xs font-semibold text-ink hover:bg-black/5 rounded-lg border-0 bg-transparent cursor-pointer"
                    >
                      <Pencil size={12} className="mr-2 text-muted" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSpace(space.id, space.name)}
                      className="w-full flex flex-row items-center px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg border-0 bg-transparent cursor-pointer"
                    >
                      <Trash2 size={12} className="mr-2" />
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      {/* Footer Nav */}
      <div className="p-2 border-t border-line space-y-1 shrink-0">
        {/* Credits */}
        <Link
          href="/credits"
          className={`flex flex-row items-center px-3 py-2 rounded-xl text-xs font-bold no-underline transition-all ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}
          style={{ backgroundColor: shade(colors.surface, -0.06), color: colors.ink }}
          title="Credits & billing"
        >
          <div className="flex flex-row items-center">
            <Zap size={15} color={colors.accent} className="shrink-0" />
            {!isCollapsed && <span className="ml-2">Credits</span>}
          </div>
          {!isCollapsed && (
            <span className="font-bold" style={{ color: colors.accent }}>
              {availableCredits}
            </span>
          )}
        </Link>

        {/* Settings */}
        <Link
          href="/settings"
          className={`flex flex-row items-center px-3 py-2 rounded-xl text-xs font-semibold no-underline transition-all ${
            pathname === '/settings' ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-black/5'
          } ${isCollapsed ? 'justify-center' : ''}`}
          title="Settings"
        >
          <Settings size={16} className="shrink-0 text-muted" />
          {!isCollapsed && <span className="ml-2.5">Settings</span>}
        </Link>

        {/* API Keys (Only for BYOK plan) */}
        {isByok && (
          <Link
            href="/keys"
            className={`flex flex-row items-center px-3 py-2 rounded-xl text-xs font-semibold no-underline transition-all ${
              pathname === '/keys' ? 'bg-accent/15 text-accent' : 'text-ink hover:bg-black/5'
            } ${isCollapsed ? 'justify-center' : ''}`}
            title="API Keys"
          >
            <Key size={16} className="shrink-0 text-muted" />
            {!isCollapsed && <span className="ml-2.5">Your API keys</span>}
          </Link>
        )}
      </div>

      {/* Account Footer */}
      <div className="p-2 border-t border-line shrink-0 relative">
        <button
          type="button"
          onClick={() => setAccountMenuOpen(!accountMenuOpen)}
          className={`w-full flex flex-row items-center p-2 rounded-xl cursor-pointer border-0 bg-transparent text-left hover:bg-black/5 transition-all ${
            isCollapsed ? 'justify-center' : ''
          }`}
        >
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ backgroundColor: colors.accent, color: colors.onAccent }}
          >
            {initial}
          </div>
          {!isCollapsed && (
            <div className="ml-2.5 flex-1 min-w-0 pr-1">
              <div className="text-xs font-bold text-ink truncate">
                {profile?.displayName || profile?.email || 'Account'}
              </div>
              <div className="text-[10px] text-muted truncate">{profile?.email}</div>
            </div>
          )}
        </button>

        {/* Account Popup Menu */}
        {accountMenuOpen && (
          <div
            className="absolute bottom-14 left-2 right-2 z-50 py-1.5 px-1 rounded-2xl shadow-xl border border-line"
            style={{ backgroundColor: colors.surface }}
          >
            <Link
              href="/plans"
              onClick={() => setAccountMenuOpen(false)}
              className="flex flex-row items-center px-3 py-2 text-xs font-semibold text-ink hover:bg-black/5 rounded-xl no-underline"
            >
              <Sparkles size={14} className="mr-2 text-amber-500" />
              Upgrade Plans
            </Link>
            <button
              type="button"
              onClick={() => {
                setAccountMenuOpen(false);
                if (confirm('Sign out?')) signOut();
              }}
              className="w-full flex flex-row items-center px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-xl border-0 bg-transparent cursor-pointer"
            >
              <LogOut size={14} className="mr-2" />
              Sign out
            </button>
          </div>
        )}
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
    </aside>
  );
};
