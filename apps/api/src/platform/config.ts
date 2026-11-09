import * as yup from 'yup';

export interface AppConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  DB_POOL_MAX: number;
  JWT_SECRET: string;
  BYOK_MASTER_KEY: string;
  CORS_ORIGINS: string;
  AUDIO_DIR: string;
  OPENROUTER_API_KEY: string;
  COOKIE_DOMAIN?: string;
  ALLOW_TEST_PAY?: boolean;
  STT_CONCURRENCY?: number;
  LLM_CONCURRENCY?: number;
  PIPELINE_WORKERS?: number;
}

const configSchema = yup.object({
  NODE_ENV: yup
    .string()
    .oneOf(['development', 'production', 'test'])
    .default('development'),
  PORT: yup.number().integer().positive().default(8080),
  DATABASE_URL: yup.string().required('DATABASE_URL is required'),
  REDIS_URL: yup.string().required('REDIS_URL is required'),
  DB_POOL_MAX: yup.number().integer().positive().default(20),
  JWT_SECRET: yup
    .string()
    .required('JWT_SECRET is required')
    .min(32, 'JWT_SECRET must be at least 32 characters long'),
  BYOK_MASTER_KEY: yup
    .string()
    .required('BYOK_MASTER_KEY is required')
    .test('is-base64-32-bytes', 'BYOK_MASTER_KEY must be a valid base64 32-byte key', (value) => {
      if (!value) return false;
      try {
        const buf = Buffer.from(value, 'base64');
        return buf.length === 32;
      } catch {
        return false;
      }
    }),
  CORS_ORIGINS: yup.string().required('CORS_ORIGINS is required'),
  AUDIO_DIR: yup.string().required('AUDIO_DIR is required').default('/data/audio'),
  OPENROUTER_API_KEY: yup.string().required('OPENROUTER_API_KEY is required'),
  COOKIE_DOMAIN: yup.string().optional(),
  ALLOW_TEST_PAY: yup.boolean().default(false),
  STT_CONCURRENCY: yup.number().integer().positive().default(16),
  LLM_CONCURRENCY: yup.number().integer().positive().default(16),
  PIPELINE_WORKERS: yup.number().integer().positive().default(32),
});

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /changeme/i,
  /example/i,
  /mock/i,
  /^secret$/i,
  /super-secret/i,
];

export function checkProductionSecrets(config: AppConfig): void {
  if (config.NODE_ENV !== 'production') return;

  if (config.ALLOW_TEST_PAY) {
    throw new Error(
      'Production startup failed: ALLOW_TEST_PAY=true cannot be enabled when NODE_ENV is production'
    );
  }

  const checks: { key: keyof AppConfig; val: string }[] = [
    { key: 'JWT_SECRET', val: config.JWT_SECRET },
    { key: 'BYOK_MASTER_KEY', val: config.BYOK_MASTER_KEY },
    { key: 'OPENROUTER_API_KEY', val: config.OPENROUTER_API_KEY },
  ];

  const violations: string[] = [];
  for (const { key, val } of checks) {
    if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(val))) {
      violations.push(`${key} contains an insecure placeholder value in production`);
    }
  }

  // Also check if BYOK_MASTER_KEY is all zeros
  const buf = Buffer.from(config.BYOK_MASTER_KEY, 'base64');
  if (buf.every((b) => b === 0)) {
    violations.push('BYOK_MASTER_KEY is an all-zero placeholder key in production');
  }

  if (violations.length > 0) {
    throw new Error(`Production startup failed with placeholder secrets:\n- ${violations.join('\n- ')}`);
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  try {
    const parsed = configSchema.validateSync(env, {
      abortEarly: false,
      stripUnknown: false,
    }) as AppConfig;

    checkProductionSecrets(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof yup.ValidationError) {
      const messages = err.inner.length > 0
        ? err.inner.map((e) => e.message).join('\n- ')
        : err.message;
      throw new Error(`Configuration validation failed:\n- ${messages}`);
    }
    throw err;
  }
}
