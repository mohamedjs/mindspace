'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  Lightbulb,
  Target,
  Book,
  Rocket,
  Palette,
  Brain,
  Briefcase,
  Sprout,
  Folder,
  Plus,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import type { Space } from '../api/spaces.api';
import { useTheme } from '@/shared/theme';
import { clay, claySurface, shade } from '@/shared/theme/clay';
import { useAuth } from '@/providers/AuthProvider';
import { getGreeting } from '@/shared/utils/greeting';

const ICON_CHOICES = [
  { id: 'lightbulb', icon: Lightbulb },
  { id: 'target', icon: Target },
  { id: 'book', icon: Book },
  { id: 'rocket', icon: Rocket },
  { id: 'palette', icon: Palette },
  { id: 'brain', icon: Brain },
  { id: 'briefcase', icon: Briefcase },
  { id: 'sprout', icon: Sprout },
];

export const getSpaceIcon = (idOrEmoji: string) => {
  return ICON_CHOICES.find((c) => c.id === idOrEmoji)?.icon || Folder;
};

interface SpacesSheetProps {
  visible: boolean;
  spaces: Space[] | undefined;
  activeSpaceId: string | null;
  creating: boolean;
  onSelect: (spaceId: string) => void;
  onCreate: (name: string, emoji: string) => void;
  onRename: (spaceId: string, newName: string) => void;
  onDelete: (spaceId: string) => void;
  onClose: () => void;
}

export const SpacesSheet: React.FC<SpacesSheetProps> = ({
  visible,
  spaces,
  activeSpaceId,
  creating,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onClose,
}) => {
  const { colors, scheme } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(ICON_CHOICES[0].id);
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

  const handleCreate = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, emoji);
    setName('');
  };

  if (!visible) return null;

  const greeting = getGreeting();
  const displayName = user?.fullName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';

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
        className="w-full max-h-[85vh] overflow-y-auto px-6 pb-10 pt-4 rounded-t-3xl md:rounded-3xl shadow-2xl"
        style={claySurface(colors, 32)}
      >
        <div
          className="mb-4 h-1.5 w-12 mx-auto rounded-full"
          style={{ backgroundColor: shade(colors.surface, -0.18) }}
        />

        <div className="mb-1 flex flex-row items-center justify-between">
          <h2 className="text-2xl font-bold text-ink">
            {greeting}, {displayName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center cursor-pointer border-0 bg-transparent text-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mb-6 text-sm font-medium text-muted">
          What's on your mind today?
        </p>

        <div className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
          My Spaces
        </div>

        <div className="mt-2 space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {!spaces && (
            <div className="py-8 text-center text-sm text-muted animate-pulse">Loading spaces…</div>
          )}
          {spaces?.map((space) => (
            <SpaceItem
              key={space.id}
              space={space}
              isActive={space.id === activeSpaceId}
              onSelect={onSelect}
              onDelete={spaces.length > 1 ? onDelete : undefined}
              onRename={onRename}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-row flex-wrap gap-2">
          {ICON_CHOICES.map((choice) => {
            const IconComp = choice.icon;
            const isSelected = emoji === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                onClick={() => setEmoji(choice.id)}
                className="h-11 w-11 flex items-center justify-center cursor-pointer border-0 transition-transform hover:scale-105 active:scale-95"
                style={clay({
                  color: isSelected
                    ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.6)
                    : shade(colors.surface, -0.05),
                  radius: 16,
                  depth: isSelected ? 1 : 0.4,
                })}
              >
                <IconComp size={20} color={colors.ink} />
              </button>
            );
          })}
        </div>

        <form
          onSubmit={handleCreate}
          className="mt-4 flex flex-row items-center px-4 py-1"
          style={clay({ color: shade(colors.surface, -0.06), radius: 18, pressed: true })}
        >
          <div className="mr-2">
            {(() => {
              const SelectedIcon = getSpaceIcon(emoji);
              return <SelectedIcon size={20} color={colors.ink} />;
            })()}
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New space name…"
            className="flex-1 py-3 text-base text-ink bg-transparent border-0 outline-none placeholder:text-muted"
            disabled={creating}
          />
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="cursor-pointer border-0 bg-transparent p-1 disabled:opacity-40"
          >
            <Plus size={24} color={name.trim() ? colors.accent : colors.line} />
          </button>
        </form>
      </div>
    </dialog>
  );
};

function SpaceItem({
  space,
  isActive,
  onSelect,
  onDelete,
  onRename,
}: {
  space: Space;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(space.name);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== space.name) {
      onRename(space.id, trimmed);
    } else {
      setName(space.name);
    }
    setEditing(false);
  };

  return (
    <div
      className="flex flex-row items-center px-4 py-3 transition-all"
      style={clay({
        color: isActive
          ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.72)
          : shade(colors.surface, -0.05),
        radius: 18,
        depth: isActive ? 0.9 : 0.5,
      })}
    >
      <button
        type="button"
        className="flex flex-row items-center cursor-pointer border-0 bg-transparent p-0"
        onClick={() => onSelect(space.id)}
        disabled={editing}
      >
        <div className="mr-3">
          {(() => {
            const IconComp = getSpaceIcon(space.emoji);
            return <IconComp size={22} color={colors.ink} />;
          })()}
        </div>
      </button>

      <div className="flex-1 flex flex-row items-center pr-2 min-w-0">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="flex-1 flex flex-row items-center"
          >
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              onBlur={handleSave}
              className="flex-1 text-base font-semibold text-ink bg-transparent border-0 outline-none p-0"
            />
            <button type="submit" className="ml-2 cursor-pointer border-0 bg-transparent">
              <Check size={18} color={colors.accent} strokeWidth={3} />
            </button>
          </form>
        ) : (
          <div className="flex-1 min-w-0">
            <button
              type="button"
              className="flex flex-row items-center cursor-pointer border-0 bg-transparent p-0 text-left"
              onClick={() => setEditing(true)}
            >
              <span className="text-base font-semibold text-ink truncate">{space.name}</span>
              <Pencil size={12} color={colors.muted} strokeWidth={2.5} className="ml-1.5 shrink-0" />
            </button>
            <div className="mt-0.5 text-xs text-muted">
              {space.noteCount} {space.noteCount === 1 ? 'note' : 'notes'}
            </div>
          </div>
        )}
      </div>

      {onDelete && !editing && (
        <button
          type="button"
          onClick={() => onDelete(space.id)}
          className="cursor-pointer border-0 bg-transparent p-1 text-muted hover:text-red-500 transition-colors"
        >
          <Trash2 size={18} color={colors.muted} />
        </button>
      )}
    </div>
  );
};
