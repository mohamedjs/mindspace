import type {
  ChargeInput,
  ChargeIntent,
  VerificationResult,
  VerifyInput,
} from '../../domain/entities.js';
import type { PaymentProviderPort } from '../../domain/ports.js';

export class InstaPayProvider implements PaymentProviderPort {
  public readonly channel = 'instapay' as const;
  public readonly displayName = 'InstaPay';

  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  private get merchantIpa(): string {
    return this.env.INSTAPAY_MERCHANT_IPA ?? '';
  }

  private get merchantName(): string {
    return this.env.INSTAPAY_MERCHANT_NAME ?? 'MindSpace';
  }

  private get verifyUrl(): string {
    return this.env.INSTAPAY_VERIFY_URL ?? '';
  }

  private get verifySecret(): string {
    return this.env.INSTAPAY_VERIFY_SECRET ?? '';
  }

  get isConfigured(): boolean {
    return Boolean(this.merchantIpa && this.verifyUrl && this.verifySecret);
  }

  async createCharge(input: ChargeInput): Promise<ChargeIntent> {
    const params = new URLSearchParams({
      pa: this.merchantIpa,
      pn: this.merchantName,
      am: input.amountEgp.toFixed(2),
      cu: 'EGP',
      tn: `MindSpace ${input.reference}`,
    });

    return {
      channel: 'instapay',
      reference: input.reference,
      amountEgp: input.amountEgp,
      payload: {
        ipa: this.merchantIpa,
        merchantName: this.merchantName,
        memo: input.reference,
        deepLink: `instapay://pay?${params.toString()}`,
        qrContent: `instapay://pay?${params.toString()}`,
      },
    };
  }

  async verify(input: VerifyInput): Promise<VerificationResult> {
    const receipt = input.receipt as { rrn?: string } | null;
    if (!receipt?.rrn) {
      return { status: 'failed', reason: 'Missing InstaPay RRN' };
    }

    const res = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.verifySecret}`,
      },
      body: JSON.stringify({
        rrn: receipt.rrn,
        expectedMemo: input.reference,
        expectedAmountEgp: input.amountEgp,
      }),
    });

    if (!res.ok) {
      return {
        status: 'failed',
        reason: `Aggregator returned ${res.status}`,
      };
    }

    const body = (await res.json()) as {
      settled?: boolean;
      amountEgp?: number;
      rrn?: string;
      reason?: string;
    };

    if (!body.settled || typeof body.amountEgp !== 'number') {
      return {
        status: 'failed',
        reason: body.reason ?? 'Transfer not found or not settled yet',
      };
    }

    return {
      status: 'verified',
      externalRef: body.rrn ?? receipt.rrn,
      amountEgp: body.amountEgp,
      raw: body,
    };
  }
}
