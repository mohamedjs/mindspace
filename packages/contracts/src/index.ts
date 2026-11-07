import * as yup from 'yup';

export const healthResponseSchema = yup.object({
  status: yup.string().required(),
  postgres: yup.string().optional(),
  redis: yup.string().optional(),
});

export type HealthResponse = yup.InferType<typeof healthResponseSchema>;

export const errorResponseSchema = yup.object({
  error: yup.string().required(),
  message: yup.string().required(),
});

export type ErrorResponse = yup.InferType<typeof errorResponseSchema>;

// Auth & Account Schemas

export const signUpRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
  password: yup.string().required('Password is required'),
  full_name: yup.string().optional().nullable(),
});

export type SignUpRequest = yup.InferType<typeof signUpRequestSchema>;

export const signInRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
  password: yup.string().required('Password is required'),
});

export type SignInRequest = yup.InferType<typeof signInRequestSchema>;

export const refreshTokenRequestSchema = yup.object({
  refresh_token: yup.string().optional(),
});

export type RefreshTokenRequest = yup.InferType<typeof refreshTokenRequestSchema>;

export const resetPasswordRequestSchema = yup.object({
  email: yup.string().email('Invalid email address').required('Email is required'),
});

export type ResetPasswordRequest = yup.InferType<typeof resetPasswordRequestSchema>;

export const confirmPasswordResetRequestSchema = yup.object({
  token: yup.string().required('Token is required'),
  password: yup.string().required('Password is required'),
});

export type ConfirmPasswordResetRequest = yup.InferType<typeof confirmPasswordResetRequestSchema>;

export const updateProfileRequestSchema = yup.object({
  display_name: yup.string().required('display_name is required'),
});

export type UpdateProfileRequest = yup.InferType<typeof updateProfileRequestSchema>;

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
  };
}

export interface AuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

export interface ProfileResponse {
  display_name: string | null;
  email: string;
}
