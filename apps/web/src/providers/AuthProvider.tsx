'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { AuthSession } from '../core/ports';
import { container } from '../infrastructure/container';
import { queryClient } from '../lib/query-client';

const auth = container.auth;

interface AuthContextValue {
  user: AuthSession['user'] | null;
  session: AuthSession | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  isLoading: true,
  signUp: async () => {},
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Restore whatever session is already in storage/cookies.
    auth
      .getSession()
      .then((restored) => {
        if (mounted) setSession(restored);
      })
      .catch((err) => {
        if (mounted) console.warn('[AuthProvider] session restore failed', err);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const unsubscribe = auth.onSessionChange((next) => {
      if (!next) {
        // The cache persists to localStorage; the next person on this browser must not inherit it.
        queryClient.clear();
        window.localStorage.removeItem('mindspace-query-cache');
      }
      if (mounted) setSession(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    isLoading,
    signUp: (email, password, fullName) => auth.signUp(email, password, fullName),
    signIn: (email, password) => auth.signIn(email, password),
    signOut: () => auth.signOut(),
    resetPassword: (email) => auth.resetPassword(email),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
