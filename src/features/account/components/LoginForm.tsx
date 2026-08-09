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
import { getGreeting } from '../../../shared/utils/greeting';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const { signIn, resetPassword } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const inputStyle = clay({
    color: shade(colors.surface, -0.05),
    radius: 18,
    pressed: true,
  }) as TextStyle;

  const handleSubmit = async () => {
    if (!email.trim() || !password) {
      Toast.show({ type: 'error', text1: 'Missing details', text2: 'Enter your email and password to continue.' });
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Sign in failed',
        text2: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Toast.show({ type: 'error', text1: 'Enter your email', text2: 'Type your email address first, then tap reset.' });
      return;
    }
    try {
      await resetPassword(email);
      Toast.show({ type: 'success', text1: 'Reset sent', text2: 'Check your email for a password reset link.' });
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Could not send reset',
        text2: err instanceof Error ? err.message : String(err),
      });
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
        <Text className="text-4xl font-bold text-ink">{getGreeting()}</Text>
        <Text className="mt-2 text-base text-muted">
          Welcome back. Sign in to your boards.
        </Text>

        <TextInput
          className="mt-8 px-4 py-4 text-base text-ink"
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
          placeholder="Password"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
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
            <Text className="text-base font-bold text-on-accent">Sign in</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity className="mt-4 items-center py-2" onPress={handleForgotPassword}>
          <Text className="text-sm text-muted">Forgot your password?</Text>
        </TouchableOpacity>

        <TouchableOpacity className="mt-6 items-center py-2" onPress={onSwitchToRegister}>
          <Text className="text-sm text-muted">New here? Create an account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
