import type {
  ChargeInput,
  ChargeIntent,
  VerificationResult,
  VerifyInput,
} from '../../domain/entities.js';
import type { PaymentProviderPort } from '../../domain/ports.js';

export class ApplePayProvider implements PaymentProviderPort {
  public readonly channel = 'apple_pay' as const;
  public readonly displayName = 'Apple Pay';

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  private get merchantId(): string {
    return this.env.APPLE_PAY_MERCHANT_ID ?? '';
  }

  private get gatewayUrl(): string {
    return this.env.APPLE_PAY_GATEWAY_URL ?? '';
  }

  private get gatewaySecret(): string {
    return this.env.APPLE_PAY_GATEWAY_SECRET ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(this.merchantId && this.gatewayUrl && this.gatewaySecret);
  }

  async createCharge(input: ChargeInput): Promise<ChargeIntent> {
    return {
      channel: 'apple_pay',
      reference: input.reference,
      amountEgp: input.amountEgp,
      payload: {
        merchantIdentifier: this.merchantId,
        countryCode: 'EG',
        currencyCode: 'EGP',
        supportedNetworks: ['visa', 'masterCard', 'meeza'],
        merchantCapabilities: ['supports3DS'],
        total: {
          label: 'MindSpace Credits',
          amount: input.amountEgp.toFixed(2),
        },
      },
    };
  }

  async verify(input: VerifyInput): Promise<VerificationResult> {
    const receipt = input.receipt as { paymentToken?: unknown } | null;
    if (!receipt?.paymentToken) {
      return { status: 'failed', reason: 'Missing Apple Pay paymentToken' };
    }
    return {
      status: 'failed',
      reason: 'Apple Pay gateway call not wired yet — see infrastructure/payments/applePay.ts',
    };
  }
}
