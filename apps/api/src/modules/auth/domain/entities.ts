export interface User {
  id: string;
  email: string;
  password_hash: string | null;
  display_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token_hash: string;
  family_id: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface Profile {
  id: string;
  display_name: string | null;
  is_anonymous: boolean;
  created_at: Date;
}
