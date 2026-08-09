import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
  type TextStyle,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { Text } from '../../../shared/ui/Text';
import { useAuth } from '../../../providers/AuthProvider';
import { useTheme } from '../../../shared/theme';
import { clay, clayAccent, shade } from '../../../shared/theme/clay';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSwitchToLogin }) => {
  const { signUp } = useAuth();
  const { colors } = useTheme();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const inputStyle = clay({
    color: shade(colors.surface, -0.05),
    radius: 18,
    pressed: true,
  }) as TextStyle;

  const handleSubmit = async () => {
    if (!fullName.trim()) {
      Toast.show({ type: 'error', text1: 'Name required', text2: 'Tell us your name so we can greet you properly.' });
      return;
    }
    if (!email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Missing details', text2: 'Enter your email and password to continue.' });
      return;
    }
    if (password.length < 8) {
      Toast.show({ type: 'error', text1: 'Password too short', text2: 'Use at least 8 characters.' });
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password, fullName);
      Toast.show({
        type: 'success',
        text1: 'Check your email',
        text2: 'We sent you a confirmation link. Open it, then sign in.',
      });
      onSwitchToLogin();
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Sign up failed',
        text2: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps="handled"
        className="px-8"
      >
        <Text className="text-4xl font-bold text-ink">Join MindSpace ✨</Text>
        <Text className="mt-2 text-base text-muted">
          Create an account to keep your boards safe.
        </Text>

        <TextInput
          className="mt-8 px-4 py-4 text-base text-ink"
          style={inputStyle}
          placeholder="Full name"
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="name"
          value={fullName}
          onChangeText={setFullName}
          editable={!busy}
        />

        <TextInput
          className="mt-3 px-4 py-4 text-base text-ink"
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
          editable={!busy}
        />

        <TextInput
          className="mt-3 px-4 py-4 text-base text-ink"
          style={inputStyle}
          placeholder="Password (8+ characters)"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          editable={!busy}
        />

        <TouchableOpacity
          className="mt-6 items-center py-4"
          style={clayAccent(colors)}
          activeOpacity={0.85}
          disabled={busy}
          onPress={handleSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text className="text-base font-bold text-on-accent">Create account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity className="mt-6 items-center py-2" onPress={onSwitchToLogin}>
          <Text className="text-sm text-muted">Already have an account? Sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
