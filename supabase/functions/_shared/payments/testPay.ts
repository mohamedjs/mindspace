import type {
  ChargeInput,
  ChargeIntent,
  PaymentProvider,
  VerifyInput,
  VerificationResult,
} from './types.ts';

/**
 * A fake wallet for developing and testing the subscription flow end to end
 * without touching a real payment network.
 *
 * Only usable when ALLOW_TEST_PAY is set on the project. Without that env var
 * it refuses every verification, so shipping the code cannot hand out free
 * subscriptions in production — the switch is deployment config, not a build
 * flag someone forgets to flip.
 */
const ENABLED_ENV = 'ALLOW_TEST_PAY';

function enabled() {
  return Deno.env.get(ENABLED_ENV) === 'true';
}

export const testPayProvider: PaymentProvider = {
  channel: 'test_pay',
  displayName: 'TestPay (sandbox)',
  get isConfigured() {
    return enabled();
  },

  async createCharge(input: ChargeInput): Promise<ChargeIntent> {
    return {
      channel: 'test_pay',
      reference: input.reference,
      amountEgp: input.amountEgp,
      payload: {
        sandbox: true,
        // The client hands this straight back to verify(); it is the whole
        // "payment", which is the point of a sandbox channel.
        confirmToken: `testpay_${input.reference}`,
        note: 'Sandbox payment — no money moves.',
      },
    };
  },

  async verify(input: VerifyInput): Promise<VerificationResult> {
    if (!enabled()) {
      return { status: 'failed', reason: 'test_pay_disabled' };
    }

    const receipt = input.receipt as { confirmToken?: string } | null;
    const expected = `testpay_${input.reference}`;

    // Still checked, so the test path exercises the same "does the receipt
    // match the attempt" logic a real provider needs.
    if (!receipt || receipt.confirmToken !== expected) {
      return { status: 'failed', reason: 'token_mismatch' };
    }

    return {
      status: 'verified',
      externalRef: expected,
      amountEgp: input.amountEgp,
      raw: receipt,
    };
  },
};
