import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useDeleteUserKey, useSaveUserKey, useUserKeys } from '../../features/byok/hooks/useUserKeys';
import type { UserKey } from '../../features/byok/api/keys.api';
import { useTheme } from '../../shared/theme';
import { clay, clayAccent, shade } from '../../shared/theme/clay';
import { ChevronLeft } from 'lucide-react-native';

const PROVIDERS = ['openrouter', 'openai', 'google', 'anthropic', 'nvidia', 'custom'] as const;

function KeyRow({ item, onDelete }: { item: UserKey; onDelete: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <View
      className="mb-4 p-4"
      style={clay({ color: colors.surface, radius: 24, depth: 0.5 })}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-ink">
          {item.provider}
          {item.label ? ` · ${item.label}` : ''}
        </Text>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Remove key?', `Requests will go back to using MindSpace credits.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => onDelete(item.id) },
            ])
          }
          hitSlop={12}
        >
          <View style={clay({ color: shade(colors.surface, -0.05), radius: 8, pressed: true })} className="px-3 py-1.5">
            <Text className="text-sm font-semibold" style={{ color: '#E53935' }}>
              Remove
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      <Text className="mt-2 text-xs font-medium text-muted">
        {item.keyHint}
      </Text>
      {!item.isActive && (
        <Text className="mt-2 text-xs font-semibold text-warning">
          Provider rejected this key{item.lastError ? `: ${item.lastError}` : ''} — replace it below.
        </Text>
      )}
    </View>
  );
}

export default function KeysScreen() {
  const router = useRouter();
  const { data: keys, isLoading } = useUserKeys();
  const saveKey = useSaveUserKey();
  const deleteKey = useDeleteUserKey();

  const { colors } = useTheme();
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>('openrouter');
  const [apiKey, setApiKey] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) {
      Toast.show({ type: 'error', text1: 'Enter a key', text2: 'Paste your API key first.' });
      return;
    }
    try {
      await saveKey.mutateAsync({ provider, apiKey: apiKey.trim() });
      setApiKey('');
      Toast.show({ type: 'success', text1: 'Key saved', text2: `Requests to ${provider} will use your own key from now on.` });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Could not save key', text2: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-board">
      <View
        className="z-30 mx-3 mt-2 flex-row items-center px-4 py-3"
        style={clay({ color: colors.surface, radius: 24 })}
      >
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="mr-2">
          <ChevronLeft size={24} color={colors.ink} strokeWidth={3} />
        </TouchableOpacity>
        <Text className="text-[19px] font-bold text-ink">Your API Keys</Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-6">
        <Text className="text-[13px] font-medium leading-5 text-muted">
          Bring your own key and MindSpace stops charging you credits for that provider —
          your key never leaves the server once saved, and never appears here again.
        </Text>

        <Text className="mb-3 mt-8 text-xs font-bold uppercase tracking-wider text-muted">
          Provider
        </Text>
        <View className="flex-row flex-wrap gap-2.5">
          {PROVIDERS.map((p) => {
            const isSelected = provider === p;
            return (
              <TouchableOpacity
                key={p}
                className="px-4 py-2"
                style={clay({
                  color: isSelected ? `${colors.accent}20` : shade(colors.surface, -0.02),
                  radius: 16,
                  pressed: isSelected,
                  depth: isSelected ? 0.5 : 0.2,
                })}
                onPress={() => setProvider(p)}
                activeOpacity={0.7}
              >
                <Text
                  className="text-[13px] font-bold"
                  style={{ color: isSelected ? colors.accent : colors.muted }}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          className="mt-6 px-5 py-4 text-base font-medium text-ink"
          style={clay({ color: shade(colors.surface, -0.03), radius: 20, pressed: true }) as any}
          placeholder={`Paste your ${provider} API key`}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          value={apiKey}
          onChangeText={setApiKey}
          editable={!saveKey.isPending}
        />

        <TouchableOpacity
          className="mt-5 items-center justify-center py-4"
          style={clayAccent(colors, 20)}
          activeOpacity={0.85}
          disabled={saveKey.isPending}
          onPress={handleSave}
        >
          {saveKey.isPending ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text className="text-base font-bold text-on-accent">
              Save key
            </Text>
          )}
        </TouchableOpacity>

        <Text className="mb-4 mt-10 text-xs font-bold uppercase tracking-wider text-muted">
          Saved keys
        </Text>
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : keys?.length ? (
          keys.map((k) => (
            <KeyRow key={k.id} item={k} onDelete={(id) => deleteKey.mutate(id)} />
          ))
        ) : (
          <Text className="text-[13px] font-medium text-muted">
            No keys saved yet. Everything runs on MindSpace credits.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
