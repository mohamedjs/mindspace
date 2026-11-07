import { randomUUID } from 'node:crypto';
import type { Clock } from '../../../platform/clock.js';
import type {
  UserRepositoryPort,
  PasswordHasherPort,
  TokenServicePort,
  RefreshTokenRepositoryPort,
  User,
} from '../domain/ports.js';
import { InvalidCredentialsError } from '../domain/errors.js';

export interface AuthenticateUserCommand {
  email: string;
  password: string;
}

export interface AuthenticateUserResult {
  user: User;
  accessToken: string;
  rawRefreshToken: string;
}

export class AuthenticateUserUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private passwordHasher: PasswordHasherPort,
    private tokenService: TokenServicePort,
    private refreshTokenRepo: RefreshTokenRepositoryPort,
    private clock: Clock
  ) {}

  async execute(command: AuthenticateUserCommand): Promise<AuthenticateUserResult> {
    const email = command.email.trim().toLowerCase();
    const password = command.password;

    const user = await this.userRepo.findByEmail(email);
    if (!user || !user.password_hash) {
      await this.passwordHasher.compareWithDummy(password);
      throw new InvalidCredentialsError();
    }

    const valid = await this.passwordHasher.compare(password, user.password_hash);
    if (!valid) {
      throw new InvalidCredentialsError();
    }

    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const familyId = randomUUID();
    const expiresAt = new Date(this.clock.now().getTime() + 30 * 24 * 60 * 60 * 1000);

    await this.refreshTokenRepo.create({
      user_id: user.id,
      token_hash: tokenHash,
      family_id: familyId,
      expires_at: expiresAt,
    });

    const accessToken = await this.tokenService.createAccessToken(user);

    return {
      user,
      accessToken,
      rawRefreshToken,
    };
  }
}
