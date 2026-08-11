import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { Mic, Settings } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';
import { CreditChip } from '../../credits/components/CreditChip';

interface NotesHeaderProps {
  /** Small line above the title — the month in calendar mode, nothing in list mode. */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  creditBalance: number;
  onOpenCredits?: () => void;
  onOpenSpaces?: () => void;
  onOpenSettings?: () => void;
  onOpenRecordings?: () => void;
}

/** The clay bar at the top of the list view. Shared by both of its tabs. */
export const NotesHeader: React.FC<NotesHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  creditBalance,
  onOpenCredits,
  onOpenSpaces,
  onOpenSettings,
  onOpenRecordings,
}) => {
  const { colors } = useTheme();

  const iconButton = clay({ color: shade(colors.surface, -0.06), radius: 18, depth: 0.6 });

  return (
    <View
      className="z-30 mx-3 mt-2 flex-row items-center justify-between px-4 py-3"
      style={clay({ color: colors.surface, radius: 24 })}
    >
      <TouchableOpacity
        className="flex-1"
        onPress={onOpenSpaces}
        disabled={!onOpenSpaces}
        activeOpacity={0.7}
      >
        {Boolean(eyebrow) && <Text className="text-[11px] font-medium text-muted">{eyebrow}</Text>}
        <Text className="text-[19px] font-bold text-ink">
          {title} {onOpenSpaces ? '▾' : ''}
        </Text>
        {Boolean(subtitle) && (
          <Text className="mt-0.5 text-[11px] font-medium text-muted">{subtitle}</Text>
        )}
      </TouchableOpacity>

      <CreditChip balance={creditBalance} onPress={onOpenCredits} />

      {onOpenRecordings && (
        <TouchableOpacity
          className="ml-2 h-9 w-9 items-center justify-center"
          style={iconButton}
          onPress={onOpenRecordings}
          accessibilityLabel="Recordings in this space"
        >
          <Mic size={18} color={colors.ink} strokeWidth={2.5} />
        </TouchableOpacity>
      )}

      {onOpenSettings && (
        <TouchableOpacity
          className="ml-2 h-9 w-9 items-center justify-center"
          style={iconButton}
          onPress={onOpenSettings}
          accessibilityLabel="Settings"
        >
          <Settings size={18} color={colors.ink} strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </View>
  );
};
