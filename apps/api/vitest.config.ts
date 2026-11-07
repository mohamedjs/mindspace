import { defineConfig } from 'vitest/config';

const databaseUrl = new URL(process.env.DATABASE_URL ?? 'postgres://mindspace:mindspace@postgres:5432/mindspace');
databaseUrl.pathname = '/mindspace_test';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globalSetup: ['src/test/globalSetup.ts'],
    env: { DATABASE_URL: databaseUrl.href },
    hookTimeout: 30_000,
  },
});
