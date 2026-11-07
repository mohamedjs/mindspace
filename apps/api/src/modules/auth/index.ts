import type { FastifyInstance } from 'fastify';
import type { Database } from '../../platform/db.js';
import type { AppConfig } from '../../platform/config.js';
import type { Clock } from '../../platform/clock.js';
import type { RequireUserHook } from '../../platform/http/auth.js';
import type { SpacesSeedPort, CreditsGrantPort, MailerPort, FileCleanupPort } from './domain/ports.js';
import {
  KyselyUserRepository,
  KyselyRefreshTokenRepository,
  KyselyPasswordResetRepository,
  KyselyProfileRepository,
  BcryptPasswordHasher,
  JoseTokenService,
  LoggingMailer,
  FsFileCleanup,
  KyselyUnitOfWork,
} from './infrastructure/index.js';
import {
  RegisterUserUseCase,
  AuthenticateUserUseCase,
  RotateRefreshTokenUseCase,
  SignOutUseCase,
  RequestPasswordResetUseCase,
  ConfirmPasswordResetUseCase,
  GetProfileUseCase,
  UpdateProfileUseCase,
  DeleteAccountUseCase,
} from './application/index.js';
import { registerAuthRoutes } from './presentation/routes.js';

export * from './domain/index.js';
export * from './application/index.js';
export * from './infrastructure/index.js';
export * from './presentation/routes.js';

export interface AuthModuleDependencies {
  db: Database;
  config: AppConfig;
  clock: Clock;
  spacesSeed: SpacesSeedPort;
  creditsGrant: CreditsGrantPort;
  mailer?: MailerPort;
  fileCleanup?: FileCleanupPort;
  requireUser?: RequireUserHook;
}

export interface AuthModule {
  registerRoutes(app: FastifyInstance): void;
  tokenService: JoseTokenService;
}

export function createAuthModule(deps: AuthModuleDependencies): AuthModule {
  const userRepo = new KyselyUserRepository(deps.db);
  const refreshTokenRepo = new KyselyRefreshTokenRepository(deps.db);
  const passwordResetRepo = new KyselyPasswordResetRepository(deps.db);
  const profileRepo = new KyselyProfileRepository(deps.db);
  const passwordHasher = new BcryptPasswordHasher();
  const tokenService = new JoseTokenService(deps.config.JWT_SECRET);
  const mailer = deps.mailer || new LoggingMailer();
  const fileCleanup = deps.fileCleanup || new FsFileCleanup(deps.config.AUDIO_DIR);
  const unitOfWork = new KyselyUnitOfWork(deps.db);

  const registerUserUseCase = new RegisterUserUseCase(
    userRepo,
    profileRepo,
    deps.creditsGrant,
    deps.spacesSeed,
    passwordHasher,
    tokenService,
    refreshTokenRepo,
    unitOfWork,
    deps.clock
  );

  const authenticateUserUseCase = new AuthenticateUserUseCase(
    userRepo,
    passwordHasher,
    tokenService,
    refreshTokenRepo,
    deps.clock
  );

  const rotateRefreshTokenUseCase = new RotateRefreshTokenUseCase(
    refreshTokenRepo,
    userRepo,
    tokenService,
    unitOfWork,
    deps.clock
  );

  const signOutUseCase = new SignOutUseCase(refreshTokenRepo, tokenService);

  const requestPasswordResetUseCase = new RequestPasswordResetUseCase(
    userRepo,
    passwordResetRepo,
    tokenService,
    mailer,
    deps.clock
  );

  const confirmPasswordResetUseCase = new ConfirmPasswordResetUseCase(
    passwordResetRepo,
    userRepo,
    refreshTokenRepo,
    passwordHasher,
    tokenService,
    unitOfWork,
    deps.clock
  );

  const getProfileUseCase = new GetProfileUseCase(userRepo, profileRepo);
  const updateProfileUseCase = new UpdateProfileUseCase(userRepo, profileRepo);
  const deleteAccountUseCase = new DeleteAccountUseCase(userRepo, fileCleanup, unitOfWork);

  return {
    tokenService,
    registerRoutes: (app: FastifyInstance) => {
      registerAuthRoutes(app, {
        config: deps.config,
        requireUser: deps.requireUser,
        registerUserUseCase,
        authenticateUserUseCase,
        rotateRefreshTokenUseCase,
        signOutUseCase,
        requestPasswordResetUseCase,
        confirmPasswordResetUseCase,
        getProfileUseCase,
        updateProfileUseCase,
        deleteAccountUseCase,
      });
    },
  };
}
