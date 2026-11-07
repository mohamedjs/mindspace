import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ValidationError } from 'yup';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function handleHttpError(
  error: FastifyError | AppError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  if (error instanceof AppError) {
    reply.status(error.status).send({
      error: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof ValidationError || error.name === 'ValidationError') {
    reply.status(422).send({
      error: 'validation_error',
      message: error.message,
    });
    return;
  }

  const fastifyError = error as FastifyError;
  if (fastifyError.validation) {
    reply.status(422).send({
      error: 'validation_error',
      message: fastifyError.message,
    });
    return;
  }

  if (fastifyError.statusCode === 429) {
    reply.status(429).send({
      error: 'too_many_requests',
      message: fastifyError.message || 'Rate limit exceeded',
    });
    return;
  }

  if (fastifyError.statusCode === 413 || fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    reply.status(413).send({
      error: 'payload_too_large',
      message: 'Request body is too large',
    });
    return;
  }

  if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
    reply.status(fastifyError.statusCode).send({
      error: fastifyError.code?.toLowerCase() || 'bad_request',
      message: fastifyError.message,
    });
    return;
  }

  // Unknown errors are logged and return internal_error with fixed message
  request.log?.error?.(error, 'Unhandled error');
  reply.status(500).send({
    error: 'internal_error',
    message: 'Internal server error',
  });
}
