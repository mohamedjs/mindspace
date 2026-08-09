import React from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ModelPicker } from '../../features/ai/components/ModelPicker';
import {
  useModelPreferences,
  useModels,
  useSetModelPreference,
} from '../../features/ai/hooks/useModels';
import { ThemeToggle } from '../../shared/theme/ThemeToggle';
import { useTheme } from '../../shared/theme';
import { clay, shade } from '../../shared/theme/clay';
import { ChevronLeft } from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { data: models } = useModels();
  const { data: prefs } = useModelPreferences();
  const setPreference = useSetModelPreference();
  const { colors } = useTheme();
  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5 });

  const choose = (kind: 'chat' | 'transcribe') => (modelRowId: string | null) =>
    setPreference.mutate(
      { kind, modelRowId },
      { onError: (err) => Toast.show({ type: 'error', text1: 'Could not save', text2: err.message }) }
    );

  return (
    <SafeAreaView className="flex-1 bg-board">
      <View
        className="z-30 mx-3 mt-2 flex-row items-center px-4 py-3"
        style={clay({ color: colors.surface, radius: 24 })}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="mr-2">
          <ChevronLeft size={24} color={colors.ink} strokeWidth={3} />
        </TouchableOpacity>
        <Text className="ml-3 text-xl font-bold text-ink">Settings</Text>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingVertical: 20 }}>
        <Text className="mb-2 text-xs uppercase text-muted">Appearance</Text>
        <View className="mb-6">
          <ThemeToggle />
        </View>

        <ModelPicker
          title="Voice → text"
          subtitle="Which model listens to your recording and writes the transcript."
          kind="transcribe"
          models={models}
          selectedId={prefs?.transcribeModelId ?? null}
          saving={setPreference.isPending}
          onSelect={choose('transcribe')}
        />

        <ModelPicker
          title="Text → sticky notes"
          subtitle="Which model reads the transcript and decides what the notes say."
          kind="chat"
          models={models}
          selectedId={prefs?.chatModelId ?? null}
          saving={setPreference.isPending}
          onSelect={choose('chat')}
        />

        <TouchableOpacity
          className="mb-3 px-4 py-4"
          style={rowStyle}
          onPress={() => router.push('/keys')}
        >
          <Text className="text-base font-semibold text-ink">Your API keys</Text>
          <Text className="mt-0.5 text-xs text-muted">
            Use your own provider key and these requests stop costing credits.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="px-4 py-4"
          style={rowStyle}
          onPress={() => router.push('/credits')}
        >
          <Text className="text-base font-semibold text-ink">Credits & billing</Text>
          <Text className="mt-0.5 text-xs text-muted">Balance, history, and sign out.</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
