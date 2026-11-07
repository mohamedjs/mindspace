import type {
  ChargeInput,
  ChargeIntent,
  VerificationResult,
  VerifyInput,
} from '../../domain/entities.js';
import type { PaymentProviderPort } from '../../domain/ports.js';

export class GooglePayProvider implements PaymentProviderPort {
  public readonly channel = 'google_pay' as const;
  public readonly displayName = 'Google Pay';

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  private get merchantId(): string {
    return this.env.GOOGLE_PAY_MERCHANT_ID ?? '';
  }

  private get gateway(): string {
    return this.env.GOOGLE_PAY_GATEWAY ?? '';
  }

  private get gatewayMerchantId(): string {
    return this.env.GOOGLE_PAY_GATEWAY_MERCHANT_ID ?? '';
  }

  private get gatewaySecret(): string {
    return this.env.GOOGLE_PAY_GATEWAY_SECRET ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(
      this.merchantId && this.gateway && this.gatewayMerchantId && this.gatewaySecret
    );
  }

  async createCharge(input: ChargeInput): Promise<ChargeIntent> {
    return {
      channel: 'google_pay',
      reference: input.reference,
      amountEgp: input.amountEgp,
      payload: {
        apiVersion: 2,
        apiVersionMinor: 0,
        merchantInfo: {
          merchantId: this.merchantId,
          merchantName: 'MindSpace',
        },
        allowedPaymentMethods: [
          {
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['VISA', 'MASTERCARD', 'MEEZA'],
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: this.gateway,
                gatewayMerchantId: this.gatewayMerchantId,
              },
            },
          },
        ],
        transactionInfo: {
          totalPriceStatus: 'FINAL',
          totalPrice: input.amountEgp.toFixed(2),
          currencyCode: 'EGP',
          countryCode: 'EG',
        },
      },
    };
  }

  async verify(input: VerifyInput): Promise<VerificationResult> {
    const receipt = input.receipt as { paymentToken?: string } | null;
    if (!receipt?.paymentToken) {
      return { status: 'failed', reason: 'Missing Google Pay paymentToken' };
    }
    return {
      status: 'failed',
      reason: `Gateway ${this.gateway} charge endpoint not wired yet — see infrastructure/payments/googlePay.ts`,
    };
  }
}
