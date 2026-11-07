import {
  PAYMENT_CHANNELS,
  type PaymentChannel,
  type ProviderSummary,
} from '../../domain/entities.js';
import {
  ProviderNotConfiguredError,
  UnknownPaymentChannelError,
} from '../../domain/errors.js';
import type {
  PaymentProviderPort,
  PaymentProviderRegistryPort,
} from '../../domain/ports.js';
import { ApplePayProvider } from './applePay.js';
import { GooglePayProvider } from './googlePay.js';
import { InstaPayProvider } from './instapay.js';
import { TestPayProvider } from './testPay.js';

export const REQUIRED_PAYMENT_SECRETS: Record<PaymentChannel, string[]> = {
  google_pay: [
    'GOOGLE_PAY_MERCHANT_ID',
    'GOOGLE_PAY_GATEWAY',
    'GOOGLE_PAY_GATEWAY_MERCHANT_ID',
    'GOOGLE_PAY_GATEWAY_SECRET',
  ],
  apple_pay: [
    'APPLE_PAY_MERCHANT_ID',
    'APPLE_PAY_GATEWAY_URL',
    'APPLE_PAY_GATEWAY_SECRET',
  ],
  instapay: [
    'INSTAPAY_MERCHANT_IPA',
    'INSTAPAY_VERIFY_URL',
    'INSTAPAY_VERIFY_SECRET',
  ],
  test_pay: ['ALLOW_TEST_PAY=true (only in non-production NODE_ENV)'],
};

export interface PaymentProviderRegistryOptions {
  allowTestPay: boolean;
  nodeEnv: string;
  env?: Record<string, string | undefined>;
}

export class PaymentProviderRegistry implements PaymentProviderRegistryPort {
  private readonly providers: Record<PaymentChannel, PaymentProviderPort>;

  constructor(options: PaymentProviderRegistryOptions) {
    const env = options.env ?? process.env;
    this.providers = {
      google_pay: new GooglePayProvider(env),
      apple_pay: new ApplePayProvider(env),
      instapay: new InstaPayProvider(env),
      test_pay: new TestPayProvider({
        allowTestPay: options.allowTestPay,
        nodeEnv: options.nodeEnv,
      }),
    };
  }

  paymentProviderFor(channel: unknown): PaymentProviderPort {
    if (
      typeof channel !== 'string' ||
      !(PAYMENT_CHANNELS as readonly string[]).includes(channel)
    ) {
      throw new UnknownPaymentChannelError(String(channel));
    }
    const typedChannel = channel as PaymentChannel;
    const provider = this.providers[typedChannel];
    if (!provider.isConfigured) {
      throw new ProviderNotConfiguredError(
        typedChannel,
        REQUIRED_PAYMENT_SECRETS[typedChannel]
      );
    }
    return provider;
  }

  listProviders(): ProviderSummary[] {
    return PAYMENT_CHANNELS.map((ch) => ({
      channel: ch,
      displayName: this.providers[ch].displayName,
      isConfigured: this.providers[ch].isConfigured,
    }));
  }
}
