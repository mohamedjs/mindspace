'use client';

import React, { useState } from 'react';
import { useTheme } from '@/shared/theme';
import { clay, shade } from '@/shared/theme/clay';
import type { AiModel, ModelKind } from '../api/models.api';
import { Check, ChevronDown } from 'lucide-react';

interface ModelPickerProps {
  title: string;
  subtitle: string;
  kind: ModelKind;
  models: AiModel[] | undefined;
  selectedId: string | null;
  saving: boolean;
  onSelect: (modelRowId: string | null) => void;
}

function costLabel(multiplier: number) {
  if (multiplier === 1) return 'standard cost';
  return multiplier < 1 ? `${multiplier}× cheaper` : `${multiplier}× cost`;
}

export const ModelPicker: React.FC<ModelPickerProps> = ({
  title,
  subtitle,
  kind,
  models,
  selectedId,
  saving,
  onSelect,
}) => {
  const { colors, scheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const options = (models ?? []).filter((m) => m.kind === kind);
  const selected = options.find((m) => (selectedId ? m.id === selectedId : m.isDefault));

  return (
    <div className="mb-6">
      <div className="mb-1 flex flex-row items-center justify-between">
        <span className="text-xs uppercase font-bold text-muted">{title}</span>
        {saving && (
          <div
            className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: `${colors.accent} transparent ${colors.accent} ${colors.accent}` }}
          />
        )}
      </div>
      <p className="mb-3 text-xs text-muted">{subtitle}</p>

      {!models && (
        <div className="py-3 text-center text-xs text-muted animate-pulse">Loading models…</div>
      )}

      {models && (
        <button
          type="button"
          className="mb-2.5 w-full flex flex-row items-center justify-between px-4 py-3.5 cursor-pointer border-0 text-left transition-all"
          style={clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5, pressed: expanded })}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex-1 text-base font-semibold text-ink">
            {selected?.displayName ?? 'Choose a model'}
          </span>
          <ChevronDown
            size={18}
            color={colors.muted}
            strokeWidth={3}
            className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      )}

      {expanded &&
        options.map((model) => {
          const isSelected = selectedId ? selectedId === model.id : model.isDefault;

          return (
            <button
              key={model.id}
              type="button"
              className="mb-2.5 w-full flex flex-row items-center px-4 py-3.5 cursor-pointer border-0 text-left transition-all disabled:opacity-50"
              style={clay({
                color: isSelected
                  ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.8)
                  : shade(colors.surface, -0.05),
                radius: 18,
                depth: isSelected ? 0.9 : 0.5,
              })}
              disabled={saving}
              onClick={() => {
                onSelect(model.isDefault ? null : model.id);
                setExpanded(false);
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-ink">{model.displayName}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {model.modelId} · {costLabel(model.creditMultiplier)}
                  {model.tier === 'paid' ? ' · paid' : ''}
                </div>
              </div>
              {isSelected && (
                <div className="ml-3 shrink-0">
                  <Check size={20} color={colors.accent} strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
    </div>
  );
};
