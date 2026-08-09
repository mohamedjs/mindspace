import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, TextInput, TouchableOpacity, View } from 'react-native';
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
import { useDeleteAccount, useProfile, useUpdateDisplayName } from '../../features/account/hooks/useAccount';
import { ThemeToggle } from '../../shared/theme/ThemeToggle';
import { useTheme } from '../../shared/theme';
import { clay, shade } from '../../shared/theme/clay';
import { useAuth } from '../../providers/AuthProvider';
import { Check, ChevronLeft, LogOut, Pencil, Trash2 } from 'lucide-react-native';

function SectionDot({ color }: { color: string }) {
  return <View className="mr-2 h-2 w-2 rounded-full" style={{ backgroundColor: color }} />;
}

function SectionHeading({ dot, children }: { dot: string; children: string }) {
  return (
    <View className="mb-3 flex-row items-center">
      <SectionDot color={dot} />
      <Text className="text-xs uppercase text-muted">{children}</Text>
    </View>
  );
}

function ProfileCard() {
  const { colors } = useTheme();
  const { data: profile, isLoading } = useProfile();
  const updateName = useUpdateDisplayName();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  const label = profile?.displayName?.trim() || profile?.email || '';
  const initial = label.charAt(0).toUpperCase() || '?';

  const startEditing = () => {
    setName(profile?.displayName ?? '');
    setEditing(true);
  };

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    updateName.mutate(trimmed, {
      onSuccess: () => setEditing(false),
      onError: (err) => Toast.show({ type: 'error', text1: 'Could not save name', text2: err.message }),
    });
  };

  return (
    <View className="mb-6 flex-row items-center p-5" style={clay({ color: colors.surface, radius: 28, depth: 0.6 })}>
      <View
        className="mr-4 h-14 w-14 items-center justify-center"
        style={clay({ color: shade(colors.accent, 0.1), radius: 28, depth: 0.4 })}
      >
        <Text className="text-xl font-bold" style={{ color: colors.onAccent }}>
          {initial}
        </Text>
      </View>

      <View className="flex-1">
        {isLoading ? (
          <ActivityIndicator color={colors.accent} style={{ alignSelf: 'flex-start' }} />
        ) : editing ? (
          <View className="flex-row items-center">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.muted}
              autoFocus
              onSubmitEditing={save}
              className="mr-2 flex-1 text-base font-bold text-ink"
              style={{ paddingVertical: 2 }}
            />
            <TouchableOpacity onPress={save} hitSlop={10} disabled={updateName.isPending}>
              {updateName.isPending ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Check size={20} color={colors.accent} strokeWidth={3} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity className="flex-row items-center" onPress={startEditing} hitSlop={6}>
            <Text className="text-base font-bold text-ink">{label || 'Add your name'}</Text>
            <Pencil size={14} color={colors.muted} strokeWidth={2.5} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}
        {profile?.email && <Text className="mt-0.5 text-xs text-muted">{profile.email}</Text>}
      </View>
    </View>
  );
}

function AiModelsSection() {
  const { data: models } = useModels();
  const { data: prefs } = useModelPreferences();
  const setPreference = useSetModelPreference();

  const choose = (kind: 'chat' | 'transcribe') => (modelRowId: string | null) =>
    setPreference.mutate(
      { kind, modelRowId },
      { onError: (err) => Toast.show({ type: 'error', text1: 'Could not save', text2: err.message }) }
    );

  return (
    <>
      <SectionHeading dot="#66BB6A">AI models</SectionHeading>
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
    </>
  );
}

function AppearanceSection() {
  const {
    colors,
    handDrawnEnabled,
    setHandDrawnEnabled,
    canvasBackgroundEnabled,
    setCanvasBackgroundEnabled,
    showChildNotes,
    setShowChildNotes,
  } = useTheme();
  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5 });

  return (
    <>
      <SectionHeading dot="#42A5F5">Appearance</SectionHeading>
      <View className="mb-3">
        <ThemeToggle />
      </View>

      <View className="mb-2.5 flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-ink">Hand-drawn text</Text>
          <Text className="mt-0.5 text-xs text-muted">Excalidraw-style font instead of the system default.</Text>
        </View>
        <Switch
          value={handDrawnEnabled}
          onValueChange={setHandDrawnEnabled}
          trackColor={{ true: colors.accent, false: shade(colors.surface, -0.15) }}
          thumbColor={colors.surface}
        />
      </View>

      <View className="mb-2.5 flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-ink">Canvas background</Text>
          <Text className="mt-0.5 text-xs text-muted">Grid and colour orbs, or a plain solid board.</Text>
        </View>
        <Switch
          value={canvasBackgroundEnabled}
          onValueChange={setCanvasBackgroundEnabled}
          trackColor={{ true: colors.accent, false: shade(colors.surface, -0.15) }}
          thumbColor={colors.surface}
        />
      </View>

      <View className="mb-6 flex-row items-center justify-between px-4 py-3.5" style={rowStyle}>
        <View className="flex-1 pr-3">
          <Text className="text-base font-semibold text-ink">Sub-notes on canvas</Text>
          <Text className="mt-0.5 text-xs text-muted">
            Show them as connected cards, or just the idea they belong to.
          </Text>
        </View>
        <Switch
          value={showChildNotes}
          onValueChange={setShowChildNotes}
          trackColor={{ true: colors.accent, false: shade(colors.surface, -0.15) }}
          thumbColor={colors.surface}
        />
      </View>
    </>
  );
}

function AccountSection() {
  const router = useRouter();
  const { signOut } = useAuth();
  const deleteAccount = useDeleteAccount();
  const { colors } = useTheme();
  const rowStyle = clay({ color: shade(colors.surface, -0.05), radius: 18, depth: 0.5 });

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes every space, recording, and note you own. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onSuccess: () => signOut(),
              onError: (err) =>
                Toast.show({ type: 'error', text1: 'Could not delete account', text2: err.message }),
            }),
        },
      ]
    );
  };

  return (
    <>
      <SectionHeading dot="#FFCA28">Account</SectionHeading>
      <TouchableOpacity className="mb-2.5 px-4 py-4" style={rowStyle} onPress={() => router.push('/keys')}>
        <Text className="text-base font-semibold text-ink">Your API keys</Text>
        <Text className="mt-0.5 text-xs text-muted">
          Use your own provider key and these requests stop costing credits.
        </Text>
      </TouchableOpacity>

      <TouchableOpacity className="mb-2.5 px-4 py-4" style={rowStyle} onPress={() => router.push('/credits')}>
        <Text className="text-base font-semibold text-ink">Credits & billing</Text>
        <Text className="mt-0.5 text-xs text-muted">Balance and history.</Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="mb-6 flex-row items-center px-4 py-4"
        style={rowStyle}
        onPress={handleDeleteAccount}
        disabled={deleteAccount.isPending}
      >
        {deleteAccount.isPending ? (
          <ActivityIndicator color="#E53935" style={{ marginRight: 10 }} />
        ) : (
          <Trash2 size={18} color="#E53935" strokeWidth={2.5} style={{ marginRight: 10 }} />
        )}
        <Text className="text-base font-semibold" style={{ color: '#E53935' }}>
          Delete account
        </Text>
      </TouchableOpacity>

      <TouchableOpacity className="flex-row items-center justify-center px-4 py-4" style={rowStyle} onPress={handleSignOut}>
        <LogOut size={18} color={colors.muted} strokeWidth={2.5} style={{ marginRight: 10 }} />
        <Text className="text-base font-semibold text-muted">Log out</Text>
      </TouchableOpacity>
    </>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

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
        <ProfileCard />
        <AiModelsSection />
        <AppearanceSection />
        <AccountSection />
      </ScrollView>
    </SafeAreaView>
  );
}
