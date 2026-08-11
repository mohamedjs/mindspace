export const PAYMENT_CHANNELS = ['google_pay', 'apple_pay', 'instapay', 'test_pay'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export interface ChargeInput {
  userId: string;
  planId: string;
  amountEgp: number;
  /** Our own id for this attempt; providers echo it back where they can. */
  reference: string;
}

/**
 * What the client needs to actually put a payment sheet on screen. The shape
 * differs per provider, so it stays opaque here — the matching client-side
 * handler is the only thing that reads `payload`.
 */
export interface ChargeIntent {
  channel: PaymentChannel;
  reference: string;
  amountEgp: number;
  /** Provider-specific: a PaymentDataRequest, a wallet number, a token… */
  payload: Record<string, unknown>;
}

export interface VerifyInput {
  reference: string;
  amountEgp: number;
  /** Whatever the client got back from the provider SDK. */
  receipt: unknown;
}

/**
 * Deliberately a discriminated union rather than a boolean or a nullable.
 *
 * A `{ ok?: boolean }` shape lets a caller read "missing" as "fine" and mint
 * credits for a payment that never happened. Here there is exactly one
 * literal that means paid, and it has to be matched explicitly.
 */
export type VerificationResult =
  | { status: 'verified'; externalRef: string; amountEgp: number; raw: unknown }
  | { status: 'failed'; reason: string };

export interface PaymentProvider {
  readonly channel: PaymentChannel;
  readonly displayName: string;
  /** False when the provider has no credentials — the UI greys it out. */
  readonly isConfigured: boolean;
  createCharge(input: ChargeInput): Promise<ChargeIntent>;
  verify(input: VerifyInput): Promise<VerificationResult>;
}

/**
 * Thrown by any provider that has been scaffolded but not wired to a real
 * account. Never caught into a success path — an unconfigured provider must
 * fail the request, not quietly return "unverified" and get treated as free.
 */
export class ProviderNotConfiguredError extends Error {
  constructor(
    readonly channel: PaymentChannel,
    readonly missing: string[]
  ) {
    super(`${channel} is not configured: set ${missing.join(', ')}`);
    this.name = 'ProviderNotConfiguredError';
  }
}
