import type { MailerPort } from '../domain/ports.js';
import { logger } from '../../../platform/logger.js';

export class LoggingMailer implements MailerPort {
  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    logger.info({ email, resetToken }, '[Mailer] Password reset email sent (logging adapter)');
  }
}
