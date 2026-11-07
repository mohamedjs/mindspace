import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { TokenServicePort } from '../domain/ports.js';

export class JoseTokenService implements TokenServicePort {
  private readonly secretKey: Uint8Array;

  constructor(jwtSecret: string) {
    this.secretKey = new TextEncoder().encode(jwtSecret);
  }

  async createAccessToken(user: { id: string; email: string; display_name: string | null }): Promise<string> {
    return new SignJWT({
      email: user.email,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'mindspace-api',
      user_metadata: user.display_name ? { full_name: user.display_name } : {},
      is_anonymous: false,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.secretKey);
  }

  async verifyAccessToken(token: string): Promise<{ sub: string; email: string; user_metadata?: { full_name?: string } }> {
    const { payload } = await jwtVerify(token, this.secretKey, {
      algorithms: ['HS256'],
      audience: 'authenticated',
    });

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      user_metadata: payload.user_metadata as any,
    };
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
