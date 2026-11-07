import type { User, RefreshToken, PasswordResetToken, Profile } from './entities.js';
export type { User, RefreshToken, PasswordResetToken, Profile };

export interface NewUserData {
  id?: string;
  email: string;
  password_hash: string;
  display_name?: string | null;
}

export interface UserRepositoryPort {
  findById(id: string, trx?: unknown): Promise<User | null>;
  findByEmail(email: string, trx?: unknown): Promise<User | null>;
  create(data: NewUserData, trx?: unknown): Promise<User>;
  updateDisplayName(id: string, displayName: string, trx?: unknown): Promise<void>;
  updatePasswordHash(id: string, passwordHash: string, trx?: unknown): Promise<void>;
  deleteUser(id: string, trx?: unknown): Promise<void>;
}

export interface NewRefreshTokenData {
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
}

export interface RefreshTokenRepositoryPort {
  create(data: NewRefreshTokenData, trx?: unknown): Promise<RefreshToken>;
  findByHash(tokenHash: string, trx?: unknown): Promise<RefreshToken | null>;
  revoke(id: string, trx?: unknown): Promise<boolean>;
  revokeFamily(familyId: string, trx?: unknown): Promise<void>;
  revokeAllForUser(userId: string, trx?: unknown): Promise<void>;
}

export interface NewPasswordResetTokenData {
  user_id: string;
  token_hash: string;
  expires_at: Date;
}

export interface PasswordResetTokenRepositoryPort {
  create(data: NewPasswordResetTokenData, trx?: unknown): Promise<PasswordResetToken>;
  findByHash(tokenHash: string, trx?: unknown): Promise<PasswordResetToken | null>;
  markUsed(id: string, trx?: unknown): Promise<boolean>;
}

export interface ProfileRepositoryPort {
  findByUserId(userId: string, trx?: unknown): Promise<Profile | null>;
  create(data: { id: string; display_name?: string | null; is_anonymous: boolean }, trx?: unknown): Promise<void>;
  updateDisplayName(userId: string, displayName: string, trx?: unknown): Promise<void>;
}

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
  compareWithDummy(password: string): Promise<boolean>;
}

export interface TokenServicePort {
  createAccessToken(user: { id: string; email: string; display_name: string | null }): Promise<string>;
  verifyAccessToken(token: string): Promise<{ sub: string; email: string; user_metadata?: { full_name?: string } }>;
  generateRefreshToken(): string;
  hashToken(token: string): string;
}

export interface MailerPort {
  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;
}

export interface SpacesSeedPort {
  createDefaultSpace(trx: unknown, userId: string): Promise<void>;
}

export interface CreditsGrantPort {
  grantSignup(trx: unknown, userId: string): Promise<void>;
}

export interface FileCleanupPort {
  deleteUserFiles(userId: string): Promise<void>;
}

export interface UnitOfWorkPort {
  transaction<T>(work: (trx: unknown) => Promise<T>): Promise<T>;
}
