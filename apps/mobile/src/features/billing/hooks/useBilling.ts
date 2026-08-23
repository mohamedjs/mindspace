import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query-client/keys';
import {
  confirmSubscription,
  fetchActiveSubscription,
  fetchPlans,
  fetchProviders,
  startSubscription,
  type PaymentChannel,
} from '../api/billing.api';
import { paymentHandlerFor } from '../payments/handlers';

export function usePlans() {
  return useQuery({
    queryKey: queryKeys.billing.plans,
    queryFn: fetchPlans,
    // The catalogue changes when we ship, not while the app is open.
    staleTime: 1000 * 60 * 60,
  });
}

export function useActiveSubscription() {
  return useQuery({
    queryKey: queryKeys.billing.subscription,
    queryFn: fetchActiveSubscription,
  });
}

export function usePaymentProviders() {
  return useQuery({
    queryKey: queryKeys.billing.providers,
    queryFn: fetchProviders,
    staleTime: 1000 * 60 * 60,
  });
}

/**
 * The whole purchase, as one mutation: open the attempt, run the channel's
 * handler to get a receipt, then let the server verify it and grant.
 *
 * Credits only ever move in subscribe-confirm — if the app dies between the
 * two calls, the subscription is left `pending` and nothing was charged.
 */
export function useSubscribe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ planId, channel }: { planId: string; channel?: PaymentChannel }) => {
      const started = await startSubscription(planId, channel);

      // A free plan ("Your AI") is activated by subscribe-start itself —
      // there is no payment sheet to open and nothing to confirm.
      if (started.free || !channel) {
        return { subscriptionId: started.subscriptionId, status: 'active', creditsGranted: 0 };
      }

      const receipt = await paymentHandlerFor(channel)(started.intent!);
      return confirmSubscription(started.subscriptionId, receipt);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.billing.subscription });
      qc.invalidateQueries({ queryKey: queryKeys.credits.balance });
      qc.invalidateQueries({ queryKey: queryKeys.credits.ledger });
    },
  });
}
