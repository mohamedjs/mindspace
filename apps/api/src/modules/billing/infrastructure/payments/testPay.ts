import type {
  ChargeInput,
  ChargeIntent,
  VerificationResult,
  VerifyInput,
} from '../../domain/entities.js';
import type { PaymentProviderPort } from '../../domain/ports.js';

export interface TestPayOptions {
  allowTestPay: boolean;
  nodeEnv: string;
}

export class TestPayProvider implements PaymentProviderPort {
  public readonly channel = 'test_pay' as const;
  public readonly displayName = 'Test card (dev only)';

  constructor(private readonly options: TestPayOptions) {}

  get isConfigured(): boolean {
    return this.options.allowTestPay === true && this.options.nodeEnv !== 'production';
  }

  async createCharge(input: ChargeInput): Promise<ChargeIntent> {
    return {
      channel: 'test_pay',
      reference: input.reference,
      amountEgp: input.amountEgp,
      payload: {
        mode: 'simulated',
        autoApprove: true,
      },
    };
  }

  async verify(input: VerifyInput): Promise<VerificationResult> {
    if (!this.isConfigured) {
      return {
        status: 'failed',
        reason: 'TestPay is disabled in this environment',
      };
    }

    const receipt = (input.receipt ?? {}) as {
      simulateFailure?: boolean;
      externalRef?: string;
    };

    if (receipt.simulateFailure) {
      return {
        status: 'failed',
        reason: 'Simulated failure requested by client',
      };
    }

    return {
      status: 'verified',
      externalRef: receipt.externalRef ?? `test_${input.reference}`,
      amountEgp: input.amountEgp,
      raw: { simulated: true, reference: input.reference },
    };
  }
}
