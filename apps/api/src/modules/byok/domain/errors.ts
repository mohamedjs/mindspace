export class MissingKeyParamsError extends Error {
  public readonly code = 'missing_params';
  public readonly status = 400;

  constructor(message = 'Missing required parameters') {
    super(message);
    this.name = 'MissingKeyParamsError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidKeyFormatError extends Error {
  public readonly code = 'invalid_key_format';
  public readonly status = 400;

  constructor(message = 'API key must be at least 8 characters') {
    super(message);
    this.name = 'InvalidKeyFormatError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CustomBaseUrlNotAllowedError extends Error {
  public readonly code = 'invalid_params';
  public readonly status = 400;

  constructor(message = 'Custom baseUrl is not allowed') {
    super(message);
    this.name = 'CustomBaseUrlNotAllowedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnsupportedByokProviderError extends Error {
  public readonly code = 'unsupported_provider';
  public readonly status = 400;

  constructor(provider: string) {
    super(`Provider '${provider}' is not allowed for BYOK; allowed: openai, anthropic, google`);
    this.name = 'UnsupportedByokProviderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class KeyValidationFailedError extends Error {
  public readonly code = 'key_validation_failed';
  public readonly status = 400;

  constructor(message = 'This key was rejected by the provider.') {
    super(message);
    this.name = 'KeyValidationFailedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class KeyNotFoundError extends Error {
  public readonly code = 'key_not_found';
  public readonly status = 404;

  constructor(message = 'API key not found') {
    super(message);
    this.name = 'KeyNotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ByokRequiredError extends Error {
  public readonly code = 'byok_required';
  public readonly status = 400;

  constructor(message = 'this model requires your own API key') {
    super(message);
    this.name = 'ByokRequiredError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NoPlatformKeyError extends Error {
  public readonly code = 'no_platform_key';
  public readonly status = 500;

  constructor(provider: string) {
    super(`No platform API key configured for ${provider}`);
    this.name = 'NoPlatformKeyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnsupportedProviderError extends Error {
  public readonly code = 'unsupported_provider';
  public readonly status = 500;

  constructor(provider: string) {
    super(`no base url configured for ${provider}`);
    this.name = 'UnsupportedProviderError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
