import { HttpError } from '../auth.ts';
import { PAYMENT_CHANNELS, type PaymentChannel, type PaymentProvider } from './types.ts';
import { testPayProvider } from './testPay.ts';
import { googlePayProvider } from './googlePay.ts';
import { applePayProvider } from './applePay.ts';
import { instapayProvider } from './instapay.ts';

/**
 * The one place that knows which channels exist.
 *
 * Everything upstream — the edge functions, the client — deals in the
 * PaymentProvider interface, so adding Fawry or a card gateway later is a new
 * file plus one line in this registry, and no change to the flow that grants
 * credits. That flow is the part worth keeping untouched.
 */
const REGISTRY: Record<PaymentChannel, PaymentProvider> = {
  test_pay: testPayProvider,
  google_pay: googlePayProvider,
  apple_pay: applePayProvider,
  instapay: instapayProvider,
};

function isChannel(value: unknown): value is PaymentChannel {
  return typeof value === 'string' && (PAYMENT_CHANNELS as readonly string[]).includes(value);
}

/** Resolve a channel from the request body, rejecting anything unknown. */
export function paymentProviderFor(channel: unknown): PaymentProvider {
  if (!isChannel(channel)) {
    throw new HttpError(400, 'unknown_payment_channel', String(channel));
  }
  return REGISTRY[channel];
}

/** What the client shows in its payment sheet, with unusable ones marked. */
export function listProviders() {
  return PAYMENT_CHANNELS.map((channel) => {
    const provider = REGISTRY[channel];
    return {
      channel,
      displayName: provider.displayName,
      isConfigured: provider.isConfigured,
    };
  });
}
