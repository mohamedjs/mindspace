import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import * as yup from 'yup';
import { AppError, handleHttpError } from './errors.js';

describe('HTTP Error Handler', () => {
  it('handles AppError and returns { error, message }', async () => {
    const app = fastify();
    app.setErrorHandler(handleHttpError);

    app.get('/test-app-error', async () => {
      throw new AppError('resource_not_found', 404, 'The requested item was not found');
    });

    const res = await app.inject({ method: 'GET', url: '/test-app-error' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: 'resource_not_found',
      message: 'The requested item was not found',
    });
  });

  it('handles Yup validation errors and returns 422 validation_error', async () => {
    const app = fastify();
    app.setErrorHandler(handleHttpError);

    app.get('/test-yup-error', async () => {
      const schema = yup.object({
        email: yup.string().email().required('Email is required'),
      });
      await schema.validate({}, { abortEarly: false });
    });

    const res = await app.inject({ method: 'GET', url: '/test-yup-error' });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('validation_error');
    expect(body.message).toContain('Email is required');
  });

  it('handles unknown errors and returns 500 internal_error with fixed message, never err.message', async () => {
    const app = fastify();
    app.setErrorHandler(handleHttpError);

    app.get('/test-unknown-error', async () => {
      throw new Error('Database password leak: postgres://admin:secret123@db');
    });

    const res = await app.inject({ method: 'GET', url: '/test-unknown-error' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: 'internal_error',
      message: 'Internal server error',
    });
  });
});
