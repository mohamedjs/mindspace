import type { RefreshTokenRepositoryPort, TokenServicePort } from '../domain/ports.js';

export class SignOutUseCase {
  constructor(
    private refreshTokenRepo: RefreshTokenRepositoryPort,
    private tokenService: TokenServicePort
  ) {}

  async execute(rawRefreshToken?: string | null): Promise<void> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      return;
    }

    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const existing = await this.refreshTokenRepo.findByHash(tokenHash);

    if (existing && existing.revoked_at === null) {
      await this.refreshTokenRepo.revoke(existing.id);
    }
  }
}
