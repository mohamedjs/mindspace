import type { Clock } from '../../../platform/clock.js';
import type {
  UserRepositoryPort,
  PasswordResetTokenRepositoryPort,
  TokenServicePort,
  MailerPort,
} from '../domain/ports.js';

export interface RequestPasswordResetCommand {
  email: string;
}

export class RequestPasswordResetUseCase {
  constructor(
    private userRepo: UserRepositoryPort,
    private passwordResetRepo: PasswordResetTokenRepositoryPort,
    private tokenService: TokenServicePort,
    private mailer: MailerPort,
    private clock: Clock
  ) {}

  async execute(command: RequestPasswordResetCommand): Promise<{ ok: boolean }> {
    const email = command.email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(email);

    if (user) {
      const rawToken = this.tokenService.generateRefreshToken();
      const tokenHash = this.tokenService.hashToken(rawToken);
      const expiresAt = new Date(this.clock.now().getTime() + 30 * 60 * 1000); // 30 minutes

      await this.passwordResetRepo.create({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });

      await this.mailer.sendPasswordResetEmail(user.email, rawToken);
    }

    return { ok: true };
  }
}
