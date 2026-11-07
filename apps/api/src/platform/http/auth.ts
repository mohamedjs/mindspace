import type { FastifyRequest, FastifyReply } from 'fastify';
import { jwtVerify } from 'jose';
import { AppError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      user_metadata?: { full_name?: string };
    };
    userId?: string;
  }
}

export type RequireUserHook = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

export function createRequireUser(secret?: string): RequireUserHook {
  if (!secret || secret.trim() === '') {
    return async function requireUserUnconfigured(): Promise<void> {
      throw new AppError('internal_error', 500, 'JWT secret is not configured');
    };
  }

  const secretKey = new TextEncoder().encode(secret);

  return async function requireUser(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('unauthorized', 401, 'missing Authorization header');
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new AppError('unauthorized', 401, 'missing Authorization header');
    }

    let payload: any;
    try {
      const verified = await jwtVerify(token, secretKey, {
        algorithms: ['HS256'],
        audience: 'authenticated',
      });
      payload = verified.payload;
    } catch (err: any) {
      if (err?.code === 'ERR_JWT_EXPIRED') {
        throw new AppError('token_expired', 401, 'Token expired');
      }
      throw new AppError('invalid_token', 401, 'Invalid token');
    }

    if (!payload || !payload.sub) {
      throw new AppError('invalid_token', 401, 'Invalid token');
    }

    const db = (req.server as any)?.db;
    if (db) {
      const userRow = await db
        .selectFrom('users')
        .select(['id', 'email', 'display_name'])
        .where('id', '=', payload.sub)
        .executeTakeFirst();

      if (!userRow) {
        throw new AppError('unauthorized', 401, 'User not found');
      }
    }

    req.user = {
      id: payload.sub,
      email: (payload.email as string) || '',
      user_metadata: (payload.user_metadata as any) || {},
    };
    req.userId = payload.sub;
  };
}

// Unconfigured instance fails closed with 500 internal_error
export const requireUser: RequireUserHook = createRequireUser();

export function currentUserId(req: FastifyRequest): string {
  if (req.userId) {
    return req.userId;
  }
  if (req.user?.id) {
    return req.user.id;
  }
  throw new AppError('unauthorized', 401, 'missing Authorization header');
}
