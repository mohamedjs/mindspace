import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AuthSession } from '../core/ports';
import { supabaseContainer } from '../infrastructure/container';

const auth = supabaseContainer.auth;

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
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    let mounted = true;

    // Restore whatever session is already in storage. No implicit sign-in —
    // an unauthenticated user gets the sign-in screen, not a throwaway account.
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
      if (mounted) setSession(next);
    });

    // Token refresh only matters while the app is in front of the user.
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        auth.startAutoRefresh();
      } else if (nextState.match(/inactive|background/)) {
        auth.stopAutoRefresh();
      }
      appStateRef.current = nextState;
    });

    return () => {
      mounted = false;
      unsubscribe();
      appStateSub.remove();
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
