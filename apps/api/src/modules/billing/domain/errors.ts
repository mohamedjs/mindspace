import type { PaymentChannel } from './entities.js';

export class MissingBillingParamsError extends Error {
  public readonly code = 'missing_params';
  public readonly status = 400;
  constructor(message = 'Missing required parameters') {
    super(message);
    this.name = 'MissingBillingParamsError';
  }
}

export class PlanNotFoundError extends Error {
  public readonly code = 'plan_not_found';
  public readonly status = 404;
  constructor(message = 'Subscription plan not found') {
    super(message);
    this.name = 'PlanNotFoundError';
  }
}

export class PlanDisabledError extends Error {
  public readonly code = 'plan_disabled';
  public readonly status = 400;
  constructor(message = 'Subscription plan is disabled') {
    super(message);
    this.name = 'PlanDisabledError';
  }
}

export class SubscriptionNotFoundError extends Error {
  public readonly code = 'subscription_not_found';
  public readonly status = 404;
  constructor(message = 'Subscription not found') {
    super(message);
    this.name = 'SubscriptionNotFoundError';
  }
}

export class SubscriptionCreateFailedError extends Error {
  public readonly code = 'subscription_create_failed';
  public readonly status = 500;
  constructor(message = 'Failed to create subscription') {
    super(message);
    this.name = 'SubscriptionCreateFailedError';
  }
}

export class UnknownPaymentChannelError extends Error {
  public readonly code = 'unknown_payment_channel';
  public readonly status = 400;
  constructor(channel: string) {
    super(`Unknown payment channel: ${channel}`);
    this.name = 'UnknownPaymentChannelError';
  }
}

export class ProviderNotConfiguredError extends Error {
  public readonly code = 'provider_not_configured';
  public readonly status = 501;
  constructor(
    public readonly channel: PaymentChannel,
    public readonly missing: string[]
  ) {
    super(`${channel} is not configured: set ${missing.join(', ')}`);
    this.name = 'ProviderNotConfiguredError';
  }
}

export class PaymentNotVerifiedError extends Error {
  public readonly code = 'payment_not_verified';
  public readonly status = 402;
  constructor(public readonly reason: string) {
    super(`Payment could not be verified: ${reason}`);
    this.name = 'PaymentNotVerifiedError';
  }
}

export class AmountMismatchError extends Error {
  public readonly code = 'amount_mismatch';
  public readonly status = 402;
  constructor(message = 'Verified payment amount does not match plan price') {
    super(message);
    this.name = 'AmountMismatchError';
  }
}

export class PaymentRecordFailedError extends Error {
  public readonly code = 'payment_record_failed';
  public readonly status = 500;
  constructor(message = 'Failed to record payment') {
    super(message);
    this.name = 'PaymentRecordFailedError';
  }
}

export class GrantFailedError extends Error {
  public readonly code = 'grant_failed';
  public readonly status = 500;
  constructor(message = 'Failed to grant subscription credits') {
    super(message);
    this.name = 'GrantFailedError';
  }
}

export class ActivePaidSubscriptionExistsError extends Error {
  public readonly code = 'active_paid_subscription_exists';
  public readonly status = 409;
  constructor(message = 'A free plan cannot replace an active paid subscription') {
    super(message);
    this.name = 'ActivePaidSubscriptionExistsError';
  }
}
