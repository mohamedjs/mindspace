import type { Clock } from '../../../platform/clock.js';
import type {
  UserRepositoryPort,
  TokenServicePort,
  RefreshTokenRepositoryPort,
  UnitOfWorkPort,
  User,
} from '../domain/ports.js';
import { InvalidTokenError, TokenExpiredError } from '../domain/errors.js';

export interface RotateRefreshTokenResult {
  user: User;
  accessToken: string;
  newRawRefreshToken: string;
}

export class RotateRefreshTokenUseCase {
  constructor(
    private refreshTokenRepo: RefreshTokenRepositoryPort,
    private userRepo: UserRepositoryPort,
    private tokenService: TokenServicePort,
    private unitOfWork: UnitOfWorkPort,
    private clock: Clock
  ) {}

  async execute(rawRefreshToken: string): Promise<RotateRefreshTokenResult> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new InvalidTokenError('Missing refresh token');
    }

    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!existing) {
      throw new InvalidTokenError('Invalid refresh token');
    }

    // Reuse detection: If the token is already revoked, revoke the entire family
    if (existing.revoked_at !== null) {
      await this.refreshTokenRepo.revokeFamily(existing.family_id);
      throw new InvalidTokenError('Refresh token has been revoked');
    }

    // Check expiration
    if (existing.expires_at.getTime() <= this.clock.now().getTime()) {
      throw new TokenExpiredError('Refresh token expired');
    }

    const user = await this.userRepo.findById(existing.user_id);
    if (!user) {
      throw new InvalidTokenError('User not found');
    }

    const newRawRefreshToken = this.tokenService.generateRefreshToken();
    const newHash = this.tokenService.hashToken(newRawRefreshToken);
    const newExpiresAt = new Date(this.clock.now().getTime() + 30 * 24 * 60 * 60 * 1000);

    const rotated = await this.unitOfWork.transaction(async (trx) => {
      const revoked = await this.refreshTokenRepo.revoke(existing.id, trx);
      if (!revoked) return false;

      await this.refreshTokenRepo.create(
        {
          user_id: existing.user_id,
          token_hash: newHash,
          family_id: existing.family_id,
          expires_at: newExpiresAt,
        },
        trx
      );
      return true;
    });

    // Outside the transaction: throwing inside it would roll this back too.
    if (!rotated) {
      await this.refreshTokenRepo.revokeFamily(existing.family_id);
      throw new InvalidTokenError('Refresh token has been revoked');
    }

    const accessToken = await this.tokenService.createAccessToken(user);

    return {
      user,
      accessToken,
      newRawRefreshToken,
    };
  }
}
