import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  signUpRequestSchema,
  signInRequestSchema,
  resetPasswordRequestSchema,
  confirmPasswordResetRequestSchema,
  updateProfileRequestSchema,
} from '@mindspace/contracts';
import type { AppConfig } from '../../../platform/config.js';
import { AppError } from '../../../platform/http/errors.js';
import { createRequireUser, type RequireUserHook, currentUserId } from '../../../platform/http/auth.js';
import {
  EmailTakenError,
  InvalidCredentialsError,
  InvalidTokenError,
  TokenExpiredError,
  WeakPasswordError,
  UserNotFoundError,
} from '../domain/errors.js';
import type {
  RegisterUserUseCase,
  AuthenticateUserUseCase,
  RotateRefreshTokenUseCase,
  SignOutUseCase,
  RequestPasswordResetUseCase,
  ConfirmPasswordResetUseCase,
  GetProfileUseCase,
  UpdateProfileUseCase,
  DeleteAccountUseCase,
} from '../application/index.js';

export interface AuthRoutesDependencies {
  config: AppConfig;
  requireUser?: RequireUserHook;
  registerUserUseCase: RegisterUserUseCase;
  authenticateUserUseCase: AuthenticateUserUseCase;
  rotateRefreshTokenUseCase: RotateRefreshTokenUseCase;
  signOutUseCase: SignOutUseCase;
  requestPasswordResetUseCase: RequestPasswordResetUseCase;
  confirmPasswordResetUseCase: ConfirmPasswordResetUseCase;
  getProfileUseCase: GetProfileUseCase;
  updateProfileUseCase: UpdateProfileUseCase;
  deleteAccountUseCase: DeleteAccountUseCase;
}

function sendAuthResponse(
  req: FastifyRequest,
  reply: FastifyReply,
  data: {
    accessToken: string;
    rawRefreshToken: string;
    user: { id: string; email: string; display_name: string | null };
  },
  config: AppConfig,
  statusCode = 200
) {
  const xClient = (req.headers['x-client'] as string | undefined)?.toLowerCase();
  const isDirectClient = xClient === 'mobile' || xClient === 'extension';

  if (!isDirectClient) {
    reply.setCookie('refresh_token', data.rawRefreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV !== 'development',
      sameSite: 'lax',
      path: '/',
      ...(config.COOKIE_DOMAIN ? { domain: config.COOKIE_DOMAIN } : {}),
      maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    });
  }

  return reply.status(statusCode).send({
    access_token: data.accessToken,
    ...(isDirectClient ? { refresh_token: data.rawRefreshToken } : {}),
    token_type: 'bearer',
    expires_in: 900, // 15 minutes
    user: {
      id: data.user.id,
      email: data.user.email,
      user_metadata: data.user.display_name ? { full_name: data.user.display_name } : {},
    },
  });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDependencies): void {
  const requireUser = deps.requireUser || createRequireUser(deps.config.JWT_SECRET);

  // 1. POST /auth/sign-up
  app.post('/auth/sign-up', async (req: FastifyRequest, reply: FastifyReply) => {
    const validated = await signUpRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      const result = await deps.registerUserUseCase.execute({
        email: validated.email,
        password: validated.password,
        full_name: validated.full_name,
      });

      return sendAuthResponse(req, reply, result, deps.config, 200);
    } catch (err) {
      if (err instanceof EmailTakenError) {
        throw new AppError('email_taken', 409, err.message);
      }
      if (err instanceof WeakPasswordError) {
        throw new AppError('weak_password', 400, err.message);
      }
      throw err;
    }
  });

  // 2. POST /auth/sign-in
  app.post(
    '/auth/sign-in',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60000,
          hook: 'preValidation',
          keyGenerator: (req: FastifyRequest) => {
            const bodyEmail = (req.body as any)?.email;
            const email = typeof bodyEmail === 'string' ? bodyEmail.trim().toLowerCase() : '';
            return `${req.ip}:${email}`;
          },
        },
      },
    },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const validated = await signInRequestSchema.validate(req.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      try {
        const result = await deps.authenticateUserUseCase.execute({
          email: validated.email,
          password: validated.password,
        });

        return sendAuthResponse(req, reply, result, deps.config, 200);
      } catch (err) {
        if (err instanceof InvalidCredentialsError) {
          throw new AppError('invalid_credentials', 401, err.message);
        }
        throw err;
      }
    }
  );

  // 3. POST /auth/refresh
  app.post('/auth/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawToken =
      (req.body as any)?.refresh_token || (req.cookies ? req.cookies.refresh_token : undefined);

    if (!rawToken || typeof rawToken !== 'string') {
      throw new AppError('unauthorized', 401, 'missing refresh token');
    }

    try {
      const result = await deps.rotateRefreshTokenUseCase.execute(rawToken);
      return sendAuthResponse(
        req,
        reply,
        {
          accessToken: result.accessToken,
          rawRefreshToken: result.newRawRefreshToken,
          user: result.user,
        },
        deps.config,
        200
      );
    } catch (err) {
      if (err instanceof InvalidTokenError || err instanceof TokenExpiredError) {
        // A dead cookie would otherwise keep the web app's route guard believing there is a session.
        reply.clearCookie('refresh_token', {
          path: '/',
          ...(deps.config.COOKIE_DOMAIN ? { domain: deps.config.COOKIE_DOMAIN } : {}),
        });
      }
      if (err instanceof InvalidTokenError) {
        throw new AppError('invalid_token', 401, err.message);
      }
      if (err instanceof TokenExpiredError) {
        throw new AppError('token_expired', 401, err.message);
      }
      throw err;
    }
  });

  // 4. POST /auth/sign-out
  app.post('/auth/sign-out', async (req: FastifyRequest, reply: FastifyReply) => {
    const rawToken =
      (req.body as any)?.refresh_token || (req.cookies ? req.cookies.refresh_token : undefined);

    if (rawToken && typeof rawToken === 'string') {
      await deps.signOutUseCase.execute(rawToken);
    }

    reply.clearCookie('refresh_token', {
      path: '/',
      ...(deps.config.COOKIE_DOMAIN ? { domain: deps.config.COOKIE_DOMAIN } : {}),
    });
    return reply.status(204).send();
  });

  // 5. POST /auth/reset-password
  app.post('/auth/reset-password', async (req: FastifyRequest, reply: FastifyReply) => {
    const validated = await resetPasswordRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    await deps.requestPasswordResetUseCase.execute({ email: validated.email });
    return reply.status(202).send({ ok: true });
  });

  // 6. POST /auth/reset-password/confirm
  app.post('/auth/reset-password/confirm', async (req: FastifyRequest, reply: FastifyReply) => {
    const validated = await confirmPasswordResetRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    try {
      await deps.confirmPasswordResetUseCase.execute({
        token: validated.token,
        password: validated.password,
      });

      return reply.status(204).send();
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        throw new AppError('invalid_token', 401, err.message);
      }
      if (err instanceof TokenExpiredError) {
        throw new AppError('token_expired', 401, err.message);
      }
      if (err instanceof WeakPasswordError) {
        throw new AppError('weak_password', 400, err.message);
      }
      throw err;
    }
  });

  // 7. GET /auth/session
  app.get('/auth/session', { preHandler: [requireUser] }, async (req: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      user: req.user,
    });
  });

  // 8. GET /account/profile
  app.get('/account/profile', { preHandler: [requireUser] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    try {
      const profile = await deps.getProfileUseCase.execute(userId);
      return reply.status(200).send(profile);
    } catch (err) {
      if (err instanceof UserNotFoundError) {
        throw new AppError('not_found', 404, err.message);
      }
      throw err;
    }
  });

  // 9. PATCH /account/profile
  app.patch('/account/profile', { preHandler: [requireUser] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    const validated = await updateProfileRequestSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    await deps.updateProfileUseCase.execute({
      userId,
      display_name: validated.display_name,
    });

    return reply.status(204).send();
  });

  // 10. DELETE /account
  app.delete('/account', { preHandler: [requireUser] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = currentUserId(req);
    await deps.deleteAccountUseCase.execute(userId);

    reply.clearCookie('refresh_token', {
      path: '/',
      ...(deps.config.COOKIE_DOMAIN ? { domain: deps.config.COOKIE_DOMAIN } : {}),
    });
    return reply.status(204).send();
  });
}
