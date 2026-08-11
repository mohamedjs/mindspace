import {
  ProviderNotConfiguredError,
  type ChargeInput,
  type ChargeIntent,
  type PaymentProvider,
  type VerifyInput,
  type VerificationResult,
} from './types.ts';

/**
 * Google Play billing.
 *
 * Scaffolded, not wired. Verifying a Play purchase means calling
 * androidpublisher.purchases.subscriptionsv2.get with a service account that
 * has been granted access to the Play Console app — none of which exists yet.
 *
 * Until it does, every method throws. That is deliberate: the alternative is
 * a provider that returns "couldn't verify" and a caller that treats it as
 * good enough, which grants a paid plan for free.
 */
const REQUIRED = ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'GOOGLE_PLAY_PACKAGE_NAME'];

function missing(): string[] {
  return REQUIRED.filter((key) => !Deno.env.get(key));
}

export const googlePayProvider: PaymentProvider = {
  channel: 'google_pay',
  displayName: 'Google Pay',
  get isConfigured() {
    return missing().length === 0;
  },

  async createCharge(_input: ChargeInput): Promise<ChargeIntent> {
    throw new ProviderNotConfiguredError('google_pay', missing());
  },

  async verify(_input: VerifyInput): Promise<VerificationResult> {
    throw new ProviderNotConfiguredError('google_pay', missing());
  },
};
