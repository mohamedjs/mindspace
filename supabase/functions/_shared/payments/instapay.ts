import {
  ProviderNotConfiguredError,
  type ChargeInput,
  type ChargeIntent,
  type PaymentProvider,
  type VerifyInput,
  type VerificationResult,
} from './types.ts';

/**
 * InstaPay (Egypt).
 *
 * Scaffolded, not wired — and the one to think hardest about. InstaPay has no
 * public merchant API for consumer wallets: the usual integration is through
 * a payment gateway that fronts it (Paymob, Fawry, Kashier), which is what
 * these env vars assume. The gateway issues an intent and calls a webhook
 * when the transfer lands.
 *
 * Do NOT implement this as "user pastes a transfer reference and we trust
 * it" — that is an unauthenticated credit grant with extra steps. Verification
 * has to come from the gateway, server to server.
 */
const REQUIRED = ['INSTAPAY_GATEWAY_API_KEY', 'INSTAPAY_MERCHANT_ID'];

function missing(): string[] {
  return REQUIRED.filter((key) => !Deno.env.get(key));
}

export const instapayProvider: PaymentProvider = {
  channel: 'instapay',
  displayName: 'InstaPay',
  get isConfigured() {
    return missing().length === 0;
  },

  async createCharge(_input: ChargeInput): Promise<ChargeIntent> {
    throw new ProviderNotConfiguredError('instapay', missing());
  },

  async verify(_input: VerifyInput): Promise<VerificationResult> {
    throw new ProviderNotConfiguredError('instapay', missing());
  },
};
