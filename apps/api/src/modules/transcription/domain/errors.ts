export class ProviderError extends Error {
  public readonly code = 'provider_error';
  public readonly status = 502;

  constructor(message = 'Speech-to-text provider returned an error') {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ProviderTimeoutError extends Error {
  public readonly code = 'provider_timeout';
  public readonly status = 504;

  constructor(message = 'Speech-to-text provider timed out') {
    super(message);
    this.name = 'ProviderTimeoutError';
  }
}
