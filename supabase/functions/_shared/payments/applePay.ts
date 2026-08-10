import {
  ProviderNotConfiguredError,
  type ChargeInput,
  type ChargeIntent,
  type PaymentProvider,
  type VerifyInput,
  type VerificationResult,
} from './types.ts';

/**
 * Apple in-app purchase / Apple Pay.
 *
 * Scaffolded, not wired. Verification means validating a signed JWS receipt
 * against Apple's App Store Server API using an issuer id, key id and .p8
 * private key from App Store Connect. The app also needs the In-App Purchase
 * capability, which is not in app.json.
 *
 * Throws until all of that exists — see googlePay.ts for why an unconfigured
 * provider must never return a soft failure.
 */
const REQUIRED = [
  'APPLE_IAP_ISSUER_ID',
  'APPLE_IAP_KEY_ID',
  'APPLE_IAP_PRIVATE_KEY',
  'APPLE_IAP_BUNDLE_ID',
];

function missing(): string[] {
  return REQUIRED.filter((key) => !Deno.env.get(key));
}

export const applePayProvider: PaymentProvider = {
  channel: 'apple_pay',
  displayName: 'Apple Pay',
  get isConfigured() {
    return missing().length === 0;
  },

  async createCharge(_input: ChargeInput): Promise<ChargeIntent> {
    throw new ProviderNotConfiguredError('apple_pay', missing());
  },

  async verify(_input: VerifyInput): Promise<VerificationResult> {
    throw new ProviderNotConfiguredError('apple_pay', missing());
  },
};
