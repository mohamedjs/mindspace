import bcrypt from 'bcrypt';
import type { PasswordHasherPort } from '../domain/ports.js';

// Precomputed bcrypt cost 12 hash for timing protection against user enumeration attacks
const DUMMY_HASH = '$2b$12$e8ImiTX.vK5hOkycR4lFyeuXz/U13p0v10Wq9Esm5Z16l3g66rEre';

export class BcryptPasswordHasher implements PasswordHasherPort {
  private readonly saltRounds = 12;

  async hash(password: string): Promise<string> {
    return await bcrypt.hash(password, this.saltRounds);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  async compareWithDummy(password: string): Promise<boolean> {
    return await bcrypt.compare(password, DUMMY_HASH);
  }
}
