import type { Clock } from '../../../platform/clock.js';
import type {
  UserRepositoryPort,
  PasswordResetTokenRepositoryPort,
  RefreshTokenRepositoryPort,
  PasswordHasherPort,
  TokenServicePort,
  UnitOfWorkPort,
} from '../domain/ports.js';
import { InvalidTokenError, TokenExpiredError, WeakPasswordError } from '../domain/errors.js';

export interface ConfirmPasswordResetCommand {
  token: string;
  password: string;
}

export class ConfirmPasswordResetUseCase {
  constructor(
    private passwordResetRepo: PasswordResetTokenRepositoryPort,
    private userRepo: UserRepositoryPort,
    private refreshTokenRepo: RefreshTokenRepositoryPort,
    private passwordHasher: PasswordHasherPort,
    private tokenService: TokenServicePort,
    private unitOfWork: UnitOfWorkPort,
    private clock: Clock
  ) {}

  async execute(command: ConfirmPasswordResetCommand): Promise<void> {
    const passwordBytes = Buffer.byteLength(command.password, 'utf8');
    if (passwordBytes < 8 || passwordBytes > 72) {
      throw new WeakPasswordError();
    }

    const tokenHash = this.tokenService.hashToken(command.token);
    const existing = await this.passwordResetRepo.findByHash(tokenHash);

    if (!existing || existing.used_at !== null) {
      throw new InvalidTokenError('Invalid or expired password reset token');
    }

    if (existing.expires_at.getTime() <= this.clock.now().getTime()) {
      throw new TokenExpiredError('Password reset token expired');
    }

    const passwordHash = await this.passwordHasher.hash(command.password);

    await this.unitOfWork.transaction(async (trx) => {
      const marked = await this.passwordResetRepo.markUsed(existing.id, trx);
      if (!marked) {
        throw new InvalidTokenError('Invalid or expired password reset token');
      }
      await this.userRepo.updatePasswordHash(existing.user_id, passwordHash, trx);
      await this.refreshTokenRepo.revokeAllForUser(existing.user_id, trx);
    });
  }
}
