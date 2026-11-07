export class AuthDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthDomainError';
  }
}

export class InvalidCredentialsError extends AuthDomainError {
  constructor(message = 'Invalid email or password') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}

export class EmailTakenError extends AuthDomainError {
  constructor(message = 'Email is already registered') {
    super(message);
    this.name = 'EmailTakenError';
  }
}

export class WeakPasswordError extends AuthDomainError {
  constructor(message = 'Password must be between 8 and 72 bytes') {
    super(message);
    this.name = 'WeakPasswordError';
  }
}

export class InvalidTokenError extends AuthDomainError {
  constructor(message = 'Invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

export class TokenExpiredError extends AuthDomainError {
  constructor(message = 'Token expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export class UserNotFoundError extends AuthDomainError {
  constructor(message = 'User not found') {
    super(message);
    this.name = 'UserNotFoundError';
  }
}
