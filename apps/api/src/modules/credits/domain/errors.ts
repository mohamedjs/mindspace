export class InsufficientCreditsError extends Error {
  public readonly code = 'insufficient_credits';
  public readonly status = 402;

  constructor(needed: number, available: number) {
    super(`INSUFFICIENT_CREDITS: need ${needed}, available ${available}`);
    this.name = 'InsufficientCreditsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCreditAmountError extends Error {
  public readonly code = 'invalid_amount';
  public readonly status = 400;

  constructor(message = 'Credit amount must be valid') {
    super(message);
    this.name = 'InvalidCreditAmountError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ProfileNotFoundError extends Error {
  public readonly code = 'profile_not_found';
  public readonly status = 404;

  constructor(message = 'Profile not found') {
    super(message);
    this.name = 'ProfileNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ReservationNotFoundError extends Error {
  public readonly code = 'reservation_not_found';
  public readonly status = 404;

  constructor(message = 'Reservation not found or already settled') {
    super(message);
    this.name = 'ReservationNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class TransactionRequiredError extends Error {
  public readonly code = 'transaction_required';
  public readonly status = 500;

  constructor(operation: string) {
    super(`${operation} requires a caller transaction`);
    this.name = 'TransactionRequiredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
