import '../../global.css';
import 'react-native-url-polyfill/auto';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Redirect, Stack, usePathname } from 'expo-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { ThemedToast } from '../shared/ui/ThemedToast';
import { ArchitectsDaughter_400Regular } from '@expo-google-fonts/architects-daughter';
import { BalooBhaijaan2_400Regular, BalooBhaijaan2_500Medium, BalooBhaijaan2_600SemiBold, BalooBhaijaan2_700Bold } from '@expo-google-fonts/baloo-bhaijaan-2';
import { asyncStoragePersister, queryClient } from '../lib/query-client';
import { AuthProvider, useAuth } from '../providers/AuthProvider';
import { RepositoryProvider } from '../providers/RepositoryProvider';
import { ThemeProvider, useTheme } from '../shared/theme';

function AuthGate() {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const { colors } = useTheme();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  // Routes reachable without a session: sign-in itself, and any future
  // deep-linked auth flow (password reset, email confirmation) under /auth.
  const isPublicRoute = pathname === '/sign-in' || pathname.startsWith('/auth/');

  if (!user && !isPublicRoute) {
    return <Redirect href="/sign-in" />;
  }

  if (user && pathname === '/sign-in') {
    return <Redirect href="/" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}

/** Status bar icons must invert with the theme or they vanish on light. */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ArchitectsDaughter: ArchitectsDaughter_400Regular,
    BalooBhaijaan2: BalooBhaijaan2_400Regular,
    BalooBhaijaan2_Medium: BalooBhaijaan2_500Medium,
    BalooBhaijaan2_SemiBold: BalooBhaijaan2_600SemiBold,
    BalooBhaijaan2_Bold: BalooBhaijaan2_700Bold,
  });

  if (!fontsLoaded) {
    return null; // Or a splash screen
  }

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister }}
        >
          <RepositoryProvider>
            <ThemeProvider>
            <AuthProvider>
              <ThemedStatusBar />
              <AuthGate />
              <ThemedToast />
            </AuthProvider>
            </ThemeProvider>
          </RepositoryProvider>
        </PersistQueryClientProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
