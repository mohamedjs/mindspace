'use client';

import React, { useState } from 'react';
import { LoginForm } from '@/features/account/components/LoginForm';
import { RegisterForm } from '@/features/account/components/RegisterForm';

export default function SignInPage() {
  const [isRegister, setIsRegister] = useState(false);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-canvas">
      {isRegister ? (
        <RegisterForm onSwitchToLogin={() => setIsRegister(false)} />
      ) : (
        <LoginForm onSwitchToRegister={() => setIsRegister(true)} />
      )}
    </div>
  );
}
