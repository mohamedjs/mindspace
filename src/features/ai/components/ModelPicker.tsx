import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import type { AiModel, ModelKind } from '../api/models.api';
import { Check } from 'lucide-react-native';

interface ModelPickerProps {
  title: string;
  subtitle: string;
  kind: ModelKind;
  models: AiModel[] | undefined;
  /** ai_models.id the user picked, or null to follow the built-in default. */
  selectedId: string | null;
  saving: boolean;
  onSelect: (modelRowId: string | null) => void;
}

/** 1.0x is the baseline; show only the deviation so the row stays scannable. */
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
  const options = (models ?? []).filter((m) => m.kind === kind);

  return (
    <View className="mb-6">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="text-xs uppercase text-muted">{title}</Text>
        {saving && <ActivityIndicator size="small" color={colors.accent} />}
      </View>
      <Text className="mb-3 text-xs text-muted">{subtitle}</Text>

      {!models && <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />}

      {options.map((model) => {
        // No stored preference means "whatever is flagged default" — show that
        // row as selected rather than leaving the list with nothing highlighted.
        const isSelected = selectedId ? selectedId === model.id : model.isDefault;

        return (
          <TouchableOpacity
            key={model.id}
            className="mb-2.5 flex-row items-center px-4 py-3.5"
            style={clay({
              color: isSelected ? shade(colors.accent, scheme === 'dark' ? -0.75 : 0.8) : shade(colors.surface, -0.05),
              radius: 18,
              depth: isSelected ? 0.9 : 0.5,
            })}
            activeOpacity={0.8}
            disabled={saving}
            onPress={() => onSelect(model.isDefault ? null : model.id)}
          >
            <View className="flex-1">
              <Text className="text-base font-semibold text-ink">{model.displayName}</Text>
              <Text className="mt-0.5 text-xs text-muted">
                {model.modelId} · {costLabel(model.creditMultiplier)}
                {model.tier === 'paid' ? ' · paid' : ''}
              </Text>
            </View>
            {isSelected && (
              <View className="ml-3">
                <Check size={20} color={colors.accent} strokeWidth={3} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
