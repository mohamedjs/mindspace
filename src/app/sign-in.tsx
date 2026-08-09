import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LoginForm } from '../features/account/components/LoginForm';
import { RegisterForm } from '../features/account/components/RegisterForm';

type Mode = 'signIn' | 'signUp';

export default function SignInScreen() {
  const [mode, setMode] = useState<Mode>('signIn');

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      {mode === 'signIn' ? (
        <LoginForm onSwitchToRegister={() => setMode('signUp')} />
      ) : (
        <RegisterForm onSwitchToLogin={() => setMode('signIn')} />
      )}
    </SafeAreaView>
  );
}
