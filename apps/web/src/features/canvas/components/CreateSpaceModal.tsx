'use client';

import React, { useState } from 'react';
import {
  Lightbulb,
  Target,
  Book,
  Rocket,
  Palette,
  Brain,
  Briefcase,
  Sprout,
} from 'lucide-react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';

export const ICON_CHOICES = [
  { id: 'lightbulb', icon: Lightbulb },
  { id: 'target', icon: Target },
  { id: 'book', icon: Book },
  { id: 'rocket', icon: Rocket },
  { id: 'palette', icon: Palette },
  { id: 'brain', icon: Brain },
  { id: 'briefcase', icon: Briefcase },
  { id: 'sprout', icon: Sprout },
];

export function getSpaceIcon(idOrEmoji?: string | null) {
  if (!idOrEmoji) return '📌';
  const match = ICON_CHOICES.find((i) => i.id === idOrEmoji);
  return match ? match.icon : idOrEmoji; // Return emoji if it's not a known ID
}

interface CreateSpaceModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (name: string, iconId: string) => void;
  isSubmitting?: boolean;
}

export const CreateSpaceModal: React.FC<CreateSpaceModalProps> = ({
  visible,
  onClose,
  onSubmit,
  isSubmitting,
}) => {
  const { colors, scheme } = useTheme();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('lightbulb');

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Create New Space"
    >
      <div
        className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        style={{
          ...clay({ color: colors.surface, radius: 24, depth: 0.8 }),
          paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden mb-3 h-1.5 w-12 mx-auto rounded-full bg-muted/40" />

        <h2 className="text-xl font-bold tracking-tight mb-4" style={{ color: colors.ink }}>
          Create New Space
        </h2>

        <div className="mb-4">
          <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-muted">
            Icon
          </label>
          <div className="flex flex-row flex-wrap gap-2">
            {ICON_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelectedIcon(choice.id)}
                className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-95"
                style={clay({
                  color: selectedIcon === choice.id ? shade(colors.accent, -0.1) : shade(colors.surface, -0.05),
                  radius: 12,
                  depth: selectedIcon === choice.id ? 0.7 : 0.5,
                  pressed: selectedIcon === choice.id,
                })}
                aria-label={choice.id}
              >
                <choice.icon
                  size={20}
                  color={selectedIcon === choice.id ? colors.onAccent : colors.muted}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold uppercase tracking-wider mb-2 text-muted">
            Space Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onSubmit(name.trim(), selectedIcon);
            }}
            placeholder="e.g. My Next Big Idea"
            className="w-full px-4 py-3 rounded-xl border outline-none font-medium text-base transition-colors"
            style={{
              backgroundColor: shade(colors.surface, -0.02),
              borderColor: colors.line,
              color: colors.ink,
            }}
            autoFocus
          />
        </div>

        <div className="flex flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[44px] py-3 rounded-xl font-bold text-base cursor-pointer border-0"
            style={clay({ color: shade(colors.surface, -0.05), radius: 12, depth: 0.5 })}
          >
            <span style={{ color: colors.ink }}>Cancel</span>
          </button>
          <button
            type="button"
            disabled={!name.trim() || isSubmitting}
            onClick={() => onSubmit(name.trim(), selectedIcon)}
            className="flex-1 min-h-[44px] py-3 rounded-xl font-bold text-base cursor-pointer border-0 opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
            style={clay({ color: colors.accent, radius: 12, depth: 0.6 })}
          >
            <span style={{ color: colors.onAccent }}>
              {isSubmitting ? 'Creating...' : 'Create Space'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
