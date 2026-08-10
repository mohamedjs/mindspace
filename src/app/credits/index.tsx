import React from 'react';
import { ActivityIndicator, Alert, FlatList, TouchableOpacity, View } from 'react-native';
import { Text } from '../../shared/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { creditsToEgp, estimateMinutes, useBalance, useLedger } from '../../features/credits/hooks/useCredits';
import type { LedgerEntry } from '../../features/credits/api/credits.api';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../shared/theme';
import { clay, shade } from '../../shared/theme/clay';
import { ChevronLeft } from 'lucide-react-native';

const REASON_LABELS: Record<string, string> = {
  signup_grant: 'Welcome bonus',
  free_refill: 'Free refill',
  purchase: 'Credits purchased',
  transcribe: 'Transcription',
  extract: 'AI extraction',
  refund: 'Refund',
};

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isCredit = entry.delta > 0;
  const date = new Date(entry.createdAt).toLocaleDateString();

  return (
    <View className="flex-row items-center justify-between border-b border-line px-5 py-3">
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink">
          {REASON_LABELS[entry.reason] ?? entry.reason}
        </Text>
        <Text className="mt-0.5 text-xs text-muted">
          {date}
        </Text>
      </View>
      <View className="items-end">
        <Text
          className="text-sm font-bold"
          style={{ color: isCredit ? '#4CAF50' : '#E53935' }}
        >
          {isCredit ? '+' : ''}
          {entry.delta}
        </Text>
        <Text className="mt-0.5 text-xs text-muted">
          {entry.balanceAfter}
        </Text>
      </View>
    </View>
  );
}

export default function CreditsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: balance, isLoading: balanceLoading } = useBalance();
  const { data: ledger, isLoading: ledgerLoading } = useLedger();

  const available = balance ? balance.creditsBalance - balance.creditsReserved : 0;

  const { colors } = useTheme();

  const handleSignOut = () => {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-board">
      {/* Header */}
      <View
        className="z-30 mx-3 mt-2 flex-row items-center justify-between px-4 py-3"
        style={clay({ color: colors.surface, radius: 24 })}
      >
        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} className="mr-2">
            <ChevronLeft size={24} color={colors.ink} strokeWidth={3} />
          </TouchableOpacity>
          <Text className="text-[19px] font-bold text-ink">Credits</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} hitSlop={12}>
          <Text className="text-sm font-semibold text-muted">
            Sign out
          </Text>
        </TouchableOpacity>
      </View>

      {/* Balance card */}
      <View
        className="m-5 p-6"
        style={clay({ color: colors.surface, radius: 32, depth: 0.5 })}
      >
        {balanceLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Text className="text-xs font-bold uppercase tracking-wider text-muted">
              Available balance
            </Text>
            <Text className="mt-2 text-5xl font-bold text-ink">{available}</Text>
            <Text className="mt-1 text-sm font-medium text-muted">
              {creditsToEgp(available)} EGP · about {estimateMinutes(available)} min of voice
            </Text>
            <TouchableOpacity className="mt-4 self-start" onPress={() => router.push('/plans')}>
              <View style={clay({ color: colors.accent, radius: 12, depth: 0.7 })} className="px-4 py-2.5">
                <Text className="text-sm font-bold" style={{ color: colors.onAccent }}>
                  Get monthly credits →
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity className="mt-3 self-start" onPress={() => router.push('/keys')}>
              <View style={clay({ color: shade(colors.surface, -0.05), radius: 12, pressed: true })} className="px-4 py-2">
                <Text className="text-sm font-bold text-accent">
                  Use your own API key instead →
                </Text>
              </View>
            </TouchableOpacity>
            {Boolean(balance?.creditsReserved) && (
              <Text className="mt-3 text-xs font-semibold text-warning">
                {balance?.creditsReserved} credits reserved for in-flight work
              </Text>
            )}
          </>
        )}
      </View>

      {/* Ledger */}
      <Text className="px-5 pb-2 text-xs uppercase text-muted">
        History
      </Text>
      {ledgerLoading ? (
        <ActivityIndicator className="mt-6" color={colors.accent} />
      ) : (
        <FlatList
          data={ledger ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <LedgerRow entry={item} />}
          ListEmptyComponent={
            <Text className="px-5 py-8 text-center text-sm text-muted">
              No credit activity yet.
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}
