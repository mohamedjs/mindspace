import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../platform/clock.js';
import type {
  UserRepositoryPort,
  ProfileRepositoryPort,
  CreditsGrantPort,
  SpacesSeedPort,
  PasswordHasherPort,
  TokenServicePort,
  RefreshTokenRepositoryPort,
  UnitOfWorkPort,
  User,
} from '../domain/ports.js';
import { EmailTakenError, WeakPasswordError } from '../domain/errors.js';

export interface RegisterUserCommand {
  email: string;
  password: string;
  full_name?: string | null;
}

export interface RegisterUserResult {
  user: User;
  accessToken: string;
  rawRefreshToken: string;
}

export class RegisterUserUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private profileRepo: ProfileRepositoryPort,
    private creditsGrant: CreditsGrantPort,
    private spacesSeed: SpacesSeedPort,
    private passwordHasher: PasswordHasherPort,
    private tokenService: TokenServicePort,
    private refreshTokenRepo: RefreshTokenRepositoryPort,
    private unitOfWork: UnitOfWorkPort,
    private clock: Clock
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisterUserResult> {
    const email = command.email.trim().toLowerCase();
    const password = command.password;
    const fullName = command.full_name?.trim() || null;

    const passwordBytes = Buffer.byteLength(password, 'utf8');
    if (passwordBytes < 8 || passwordBytes > 72) {
      throw new WeakPasswordError();
    }

    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new EmailTakenError();
    }

    const passwordHash = await this.passwordHasher.hash(password);
    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const familyId = randomUUID();
    const expiresAt = new Date(this.clock.now().getTime() + 30 * 24 * 60 * 60 * 1000);

    const createdUser = await this.unitOfWork.transaction(async (trx) => {
      const user = await this.userRepo.create(
        {
          email,
          password_hash: passwordHash,
          display_name: fullName,
        },
        trx
      );

      await this.profileRepo.create(
        {
          id: user.id,
          display_name: fullName,
          is_anonymous: false,
        },
        trx
      );

      await this.creditsGrant.grantSignup(trx, user.id);
      await this.spacesSeed.createDefaultSpace(trx, user.id);

      await this.refreshTokenRepo.create(
        {
          user_id: user.id,
          token_hash: tokenHash,
          family_id: familyId,
          expires_at: expiresAt,
        },
        trx
      );

      return user;
    });

    const accessToken = await this.tokenService.createAccessToken(createdUser);

    return {
      user: createdUser,
      accessToken,
      rawRefreshToken,
    };
  }
}
