import React from 'react';
import { Modal, Pressable, TouchableOpacity, View } from 'react-native';
import { Text } from '../../../shared/ui/Text';
import { useRouter } from 'expo-router';
import { creditsToEgp } from '../hooks/useCredits';
import { useTheme } from '../../../shared/theme';

interface OutOfCreditsSheetProps {
  visible: boolean;
  /** Credit cost of the action that was blocked. */
  requiredCredits: number;
  availableCredits: number;
  /** What the user was trying to do, e.g. "transcribe this recording". */
  actionLabel?: string;
  onClose: () => void;
}

export const OutOfCreditsSheet: React.FC<OutOfCreditsSheetProps> = ({
  visible,
  requiredCredits,
  availableCredits,
  actionLabel = 'continue',
  onClose,
}) => {
  const router = useRouter();
  const { colors } = useTheme();
  const shortfall = Math.max(0, requiredCredits - availableCredits);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" style={{ backgroundColor: colors.scrim }} onPress={onClose}>
        <Pressable
          className="rounded-t-3xl border-t border-line bg-surface px-6 pb-10 pt-5"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-4 h-1 w-10 self-center rounded-full bg-muted/40" />

          <Text className="text-xl font-bold text-ink">Not enough credits</Text>
          <Text className="mt-2 text-sm leading-5 text-muted">
            You need {requiredCredits} credits to {actionLabel}, but you have {availableCredits}.
          </Text>

          <View className="mt-5 rounded-xl border border-line p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-muted">
                Needed
              </Text>
              <Text className="text-sm font-semibold text-ink">{requiredCredits}</Text>
            </View>
            <View className="mt-2 flex-row items-center justify-between">
              <Text className="text-sm text-muted">
                You have
              </Text>
              <Text className="text-sm font-semibold text-ink">{availableCredits}</Text>
            </View>
            <View className="mt-2 flex-row items-center justify-between border-t border-line pt-2">
              <Text className="text-sm font-semibold text-warning">
                Short by
              </Text>
              <Text className="text-sm font-bold text-warning">
                {shortfall} · {creditsToEgp(shortfall)} EGP
              </Text>
            </View>
          </View>

          <TouchableOpacity
            className="mt-5 items-center rounded-xl bg-accent py-4"
            activeOpacity={0.85}
            onPress={() => {
              onClose();
              router.push('/credits');
            }}
          >
            <Text className="text-base font-bold text-on-accent">
              Buy credits
            </Text>
          </TouchableOpacity>

          <TouchableOpacity className="mt-3 items-center py-2" onPress={onClose}>
            <Text className="text-sm text-muted">
              Not now
            </Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
