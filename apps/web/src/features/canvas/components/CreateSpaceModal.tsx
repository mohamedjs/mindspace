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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        className="w-full max-w-sm rounded-3xl p-6 shadow-2xl relative"
        style={clay({ color: colors.surface, radius: 24, depth: 0.8 })}
      >
        <h2 className="text-xl font-bold tracking-tight mb-4" style={{ color: colors.ink }}>
          Create New Space
        </h2>

        <div className="mb-4">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted">
            Icon
          </label>
          <div className="flex flex-row flex-wrap gap-2">
            {ICON_CHOICES.map((choice) => (
              <button
                key={choice.id}
                type="button"
                onClick={() => setSelectedIcon(choice.id)}
                className="w-10 h-10 rounded-xl flex items-center justify-center border-0 cursor-pointer transition-transform active:scale-95"
                style={clay({
                  color: selectedIcon === choice.id ? shade(colors.accent, -0.1) : shade(colors.surface, -0.05),
                  radius: 12,
                  depth: selectedIcon === choice.id ? 0.7 : 0.5,
                  pressed: selectedIcon === choice.id,
                })}
              >
                <choice.icon
                  size={18}
                  color={selectedIcon === choice.id ? colors.onAccent : colors.muted}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-muted">
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
            className="w-full px-4 py-3 rounded-xl border outline-none font-medium text-sm transition-colors"
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
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer border-0"
            style={clay({ color: shade(colors.surface, -0.05), radius: 12, depth: 0.5 })}
          >
            <span style={{ color: colors.ink }}>Cancel</span>
          </button>
          <button
            type="button"
            disabled={!name.trim() || isSubmitting}
            onClick={() => onSubmit(name.trim(), selectedIcon)}
            className="flex-1 py-3 rounded-xl font-bold text-sm cursor-pointer border-0 opacity-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
