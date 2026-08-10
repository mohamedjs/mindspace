import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { CalendarDays, List, type LucideIcon } from 'lucide-react-native';
import { Text } from '../../../shared/ui/Text';
import { useTheme } from '../../../shared/theme';
import { clay, shade } from '../../../shared/theme/clay';

export type NotesTab = 'list' | 'calendar';

interface ViewTabsProps {
  value: NotesTab;
  onChange: (next: NotesTab) => void;
}

const TABS: { value: NotesTab; icon: LucideIcon; label: string }[] = [
  { value: 'list', icon: List, label: 'All notes' },
  { value: 'calendar', icon: CalendarDays, label: 'Calendar' },
];

/** All notes vs. a day at a time — two readings of the same notes. */
export const ViewTabs: React.FC<ViewTabsProps> = ({ value, onChange }) => {
  const { colors } = useTheme();

  return (
    <View
      className="mx-3 mt-3 flex-row p-1.5"
      style={clay({ color: shade(colors.surface, -0.08), radius: 18, pressed: true })}
    >
      {TABS.map(({ value: tab, icon: Icon, label }) => {
        const active = value === tab;
        return (
          <TouchableOpacity
            key={tab}
            className="flex-1 flex-row items-center justify-center py-2"
            style={active ? clay({ color: colors.accent, radius: 13, depth: 0.7 }) : undefined}
            onPress={() => onChange(tab)}
            activeOpacity={0.8}
          >
            <Icon
              size={14}
              color={active ? colors.onAccent : colors.muted}
              strokeWidth={2.5}
              style={{ marginRight: 6 }}
            />
            <Text
              className="text-xs font-bold"
              style={{ color: active ? colors.onAccent : colors.muted }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
