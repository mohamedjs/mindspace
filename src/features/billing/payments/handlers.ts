import type { ChargeIntent, PaymentChannel } from '../api/billing.api';

/**
 * Client half of the payment factory.
 *
 * Deliberately thin: all it does is turn an intent from the server into a
 * receipt the server can verify. The security lives on the other side — this
 * side cannot be trusted and is not asked to be. Adding a channel is one
 * entry here plus a provider on the server.
 */
export type PaymentHandler = (intent: ChargeIntent) => Promise<unknown>;

/** Thrown when a channel is listed but its native SDK isn't wired up. */
export class PaymentUnavailableError extends Error {
  constructor(readonly channel: PaymentChannel) {
    super(`${channel} is not available in this build yet`);
    this.name = 'PaymentUnavailableError';
  }
}

const notWiredYet =
  (channel: PaymentChannel): PaymentHandler =>
  async () => {
    throw new PaymentUnavailableError(channel);
  };

const HANDLERS: Record<PaymentChannel, PaymentHandler> = {
  /**
   * Sandbox: hand the token straight back. Everything the real channels will
   * do around this — sheet, SDK, callback — is skipped on purpose so the rest
   * of the flow can be exercised without a payment network.
   */
  test_pay: async (intent) => ({ confirmToken: intent.payload.confirmToken }),

  // Each needs its native SDK plus store credentials; see the matching
  // provider file under supabase/functions/_shared/payments/ for the list.
  google_pay: notWiredYet('google_pay'),
  apple_pay: notWiredYet('apple_pay'),
  instapay: notWiredYet('instapay'),
};

export function paymentHandlerFor(channel: PaymentChannel): PaymentHandler {
  return HANDLERS[channel] ?? notWiredYet(channel);
}
