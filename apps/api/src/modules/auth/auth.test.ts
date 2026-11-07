import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { composeApp, type AppComposition } from '../../composition.js';
import bcrypt from 'bcrypt';
import { SignJWT } from 'jose';

describe('Auth and Account Module', () => {
  let app: AppComposition;

  beforeAll(async () => {
    app = await composeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

  describe('Sign-up (POST /auth/sign-up)', () => {
    it('creates user, profile, default space, and grants 100 credits in one transaction', async () => {
      const email = testEmail();
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: {
          email,
          password: 'Password123!',
          full_name: 'Test Explorer',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.access_token).toBeDefined();
      expect(body.token_type).toBe('bearer');
      expect(body.expires_in).toBe(900);
      expect(body.user.email).toBe(email);
      expect(body.user.user_metadata?.full_name).toBe('Test Explorer');

      // Web client: refresh token is in httpOnly cookie, not in JSON
      expect(body.refresh_token).toBeUndefined();
      const cookies = res.cookies;
      const refreshCookie = cookies.find((c) => c.name === 'refresh_token');
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie?.httpOnly).toBe(true);

      // Verify DB state
      const userId = body.user.id;
      const userRow = await app.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(userRow.password_hash).toBeDefined();
      expect(userRow.password_hash?.startsWith('$2b$12$')).toBe(true);

      const profileRow = await app.db
        .selectFrom('profiles')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(profileRow.credits_balance).toBe(100);
      expect(profileRow.display_name).toBe('Test Explorer');
      expect(profileRow.is_anonymous).toBe(false);

      const spaceRows = await app.db
        .selectFrom('spaces')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
      expect(spaceRows.length).toBe(1);
      expect(spaceRows[0].name).toBe('My MindSpace');
      expect(spaceRows[0].emoji).toBe('💡');

      const ledgerRows = await app.db
        .selectFrom('credit_ledger')
        .selectAll()
        .where('user_id', '=', userId)
        .execute();
      expect(ledgerRows.length).toBe(1);
      expect(ledgerRows[0].delta).toBe(100);
      expect(ledgerRows[0].balance_after).toBe(100);
      expect(ledgerRows[0].reason).toBe('signup_grant');
    });

    it('returns refresh_token in JSON when X-Client: mobile or extension is sent', async () => {
      const email = testEmail();
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: {
          'x-client': 'mobile',
        },
        payload: {
          email,
          password: 'Password123!',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.refresh_token).toBeDefined();
      expect(typeof body.refresh_token).toBe('string');
      // No cookie set for mobile
      const refreshCookie = res.cookies.find((c) => c.name === 'refresh_token');
      expect(refreshCookie).toBeUndefined();
    });

    it('rejects duplicate email with 409 email_taken', async () => {
      const email = testEmail();
      await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!' },
      });

      const duplicateRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'AnotherPassword123!' },
      });

      expect(duplicateRes.statusCode).toBe(409);
      expect(duplicateRes.json().error).toBe('email_taken');
    });

    it('rejects weak password with 400 weak_password', async () => {
      const email = testEmail();
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'short' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('weak_password');
    });

    it('rejects passwords over 72 UTF-8 bytes with 400 weak_password', async () => {
      const email = testEmail();
      const longPassword = 'A'.repeat(73);
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: longPassword },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('weak_password');
    });
  });

  describe('Sign-in (POST /auth/sign-in)', () => {
    it('authenticates with correct credentials and returns token pair', async () => {
      const email = testEmail();
      await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!', full_name: 'Valid User' },
      });

      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        headers: { 'x-client': 'extension' },
        payload: { email, password: 'Password123!' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.access_token).toBeDefined();
      expect(body.refresh_token).toBeDefined();
      expect(body.user.email).toBe(email);
    });

    it('returns 401 invalid_credentials for wrong password', async () => {
      const email = testEmail();
      await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!' },
      });

      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: 'WrongPassword999!' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: 'invalid_credentials',
        message: 'Invalid email or password',
      });
    });

    it('returns identical 401 invalid_credentials response for unknown email', async () => {
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: 'nonexistent-user@example.com', password: 'SomePassword123!' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: 'invalid_credentials',
        message: 'Invalid email or password',
      });
    });

    it('enforces rate limit of 10 per minute per IP + email', async () => {
      const targetEmail = testEmail();
      for (let i = 0; i < 10; i++) {
        await app.server.inject({
          method: 'POST',
          url: '/auth/sign-in',
          payload: { email: targetEmail, password: 'WrongPassword!' },
        });
      }

      const rateLimitedRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: targetEmail, password: 'WrongPassword!' },
      });

      expect(rateLimitedRes.statusCode).toBe(429);
      expect(rateLimitedRes.json().error).toBe('too_many_requests');
    });
  });

  describe('Refresh Token Rotation & Reuse Revocation (POST /auth/refresh)', () => {
    it('rotates refresh token on use: old token revoked, new token valid', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      const initialRefreshToken = signUpRes.json().refresh_token;

      // 1. Refresh using initial token
      const refreshRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: initialRefreshToken },
      });

      expect(refreshRes.statusCode).toBe(200);
      const newRefreshToken = refreshRes.json().refresh_token;
      expect(newRefreshToken).toBeDefined();
      expect(newRefreshToken).not.toBe(initialRefreshToken);

      // 2. Refresh using the new token succeeds
      const secondRefreshRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: newRefreshToken },
      });
      expect(secondRefreshRes.statusCode).toBe(200);
    });

    it('reuse of a rotated token revokes the entire token family', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      const token1 = signUpRes.json().refresh_token;

      // Rotate token 1 -> token 2
      const refreshRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: token1 },
      });
      expect(refreshRes.statusCode).toBe(200);
      const token2 = refreshRes.json().refresh_token;

      // REUSE ATTEMPT: Attempt to refresh using already-rotated token 1
      const reuseRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: token1 },
      });
      expect(reuseRes.statusCode).toBe(401);
      expect(reuseRes.json().error).toBe('invalid_token');

      // Now token 2 (the descendant in the same family) MUST also be revoked!
      const victimRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: token2 },
      });
      expect(victimRes.statusCode).toBe(401);
      expect(victimRes.json().error).toBe('invalid_token');
    });

    it('rejects expired refresh token with 401 token_expired', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      const rawToken = signUpRes.json().refresh_token;
      const tokenHash = app.authModule.tokenService.hashToken(rawToken);

      // Force expiration in DB
      await app.db
        .updateTable('refresh_tokens')
        .set({ expires_at: new Date(Date.now() - 1000) })
        .where('token_hash', '=', tokenHash)
        .execute();

      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: rawToken },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe('token_expired');
    });

    it('concurrent refresh rotation race: 10 parallel calls with one token yields at most one success, and revokes whole family', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      const token = signUpRes.json().refresh_token;
      const tokenHash = app.authModule.tokenService.hashToken(token);
      const tokenRow = await app.db
        .selectFrom('refresh_tokens')
        .selectAll()
        .where('token_hash', '=', tokenHash)
        .executeTakeFirstOrThrow();
      const familyId = tokenRow.family_id;

      // 10 parallel /auth/refresh calls with the exact same token
      const promises = Array.from({ length: 10 }, () =>
        app.server.inject({
          method: 'POST',
          url: '/auth/refresh',
          headers: { 'x-client': 'mobile' },
          payload: { refresh_token: token },
        })
      );

      const results = await Promise.all(promises);
      const successful = results.filter((r) => r.statusCode === 200);
      const rejected = results.filter((r) => r.statusCode === 401);

      // At most one succeeds
      expect(successful.length).toBeLessThanOrEqual(1);
      expect(rejected.length).toBeGreaterThanOrEqual(9);

      // And afterwards, no unrevoked token remains in that family!
      const unrevokedTokens = await app.db
        .selectFrom('refresh_tokens')
        .selectAll()
        .where('family_id', '=', familyId)
        .where('revoked_at', 'is', null)
        .execute();

      expect(unrevokedTokens.length).toBe(0);
    });
  });

  describe('Sign-out (POST /auth/sign-out)', () => {
    it('revokes refresh token and clears cookie', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      const rawToken = signUpRes.json().refresh_token;

      const signOutRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-out',
        payload: { refresh_token: rawToken },
      });

      expect(signOutRes.statusCode).toBe(204);

      // Verify token can no longer be used
      const refreshRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        payload: { refresh_token: rawToken },
      });
      expect(refreshRes.statusCode).toBe(401);
    });
  });

  describe('Password Reset (POST /auth/reset-password & confirm)', () => {
    it('always returns 202 whether email exists or not', async () => {
      const res1 = await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { email: 'nonexistent@example.com' },
      });
      expect(res1.statusCode).toBe(202);
      expect(res1.json()).toEqual({ ok: true });

      const email = testEmail();
      await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!' },
      });

      const res2 = await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { email },
      });
      expect(res2.statusCode).toBe(202);
      expect(res2.json()).toEqual({ ok: true });
    });

    it('allows password reset and enforces single-use token', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'OldPassword123!' },
      });
      const userId = signUpRes.json().user.id;

      await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { email },
      });

      // Retrieve reset token row from DB
      const resetRow = await app.db
        .selectFrom('password_reset_tokens')
        .selectAll()
        .where('user_id', '=', userId)
        .where('used_at', 'is', null)
        .executeTakeFirstOrThrow();

      // In real scenario, the raw token was mailed. In our test, create a known raw token
      const rawResetToken = 'known-test-reset-token-' + Date.now();
      const tokenHash = app.authModule.tokenService.hashToken(rawResetToken);
      await app.db
        .updateTable('password_reset_tokens')
        .set({ token_hash: tokenHash })
        .where('id', '=', resetRow.id)
        .execute();

      // 1. Confirm reset
      const confirmRes = await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password/confirm',
        payload: {
          token: rawResetToken,
          password: 'BrandNewPassword123!',
        },
      });
      expect(confirmRes.statusCode).toBe(204);

      // Verify sign in with new password works
      const signInRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: 'BrandNewPassword123!' },
      });
      expect(signInRes.statusCode).toBe(200);

      // Verify sign in with old password fails
      const oldSignInRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email, password: 'OldPassword123!' },
      });
      expect(oldSignInRes.statusCode).toBe(401);

      // 2. SINGLE-USE TEST: Using the same reset token a second time must fail
      const reuseResetRes = await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password/confirm',
        payload: {
          token: rawResetToken,
          password: 'YetAnotherPassword123!',
        },
      });
      expect(reuseResetRes.statusCode).toBe(401);
      expect(reuseResetRes.json().error).toBe('invalid_token');
    });

    it('rejects reset password over 72 UTF-8 bytes with 400 weak_password', async () => {
      const res = await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password/confirm',
        payload: {
          token: 'some-token',
          password: 'A'.repeat(73),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('weak_password');
    });

    it('concurrent reset confirm race: 5 parallel confirms with one token give exactly one 204, and stored hash matches winner', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'OldPassword123!' },
      });
      const userId = signUpRes.json().user.id;

      await app.server.inject({
        method: 'POST',
        url: '/auth/reset-password',
        payload: { email },
      });

      const resetRow = await app.db
        .selectFrom('password_reset_tokens')
        .selectAll()
        .where('user_id', '=', userId)
        .where('used_at', 'is', null)
        .executeTakeFirstOrThrow();

      const rawResetToken = 'parallel-reset-token-' + Date.now();
      const tokenHash = app.authModule.tokenService.hashToken(rawResetToken);
      await app.db
        .updateTable('password_reset_tokens')
        .set({ token_hash: tokenHash })
        .where('id', '=', resetRow.id)
        .execute();

      // 5 parallel confirms, each sending a different unique password
      const passwords = ['WinnerPass1!', 'WinnerPass2!', 'WinnerPass3!', 'WinnerPass4!', 'WinnerPass5!'];
      const promises = passwords.map((pwd) =>
        app.server.inject({
          method: 'POST',
          url: '/auth/reset-password/confirm',
          payload: {
            token: rawResetToken,
            password: pwd,
          },
        })
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.statusCode === 204);
      const failures = results.filter((r) => r.statusCode === 401);

      expect(successes.length).toBe(1);
      expect(failures.length).toBe(4);

      // Verify the stored hash matches the winning password
      const winningIndex = results.findIndex((r) => r.statusCode === 204);
      const winningPassword = passwords[winningIndex];

      const userRow = await app.db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();

      const isWinnerMatch = await bcrypt.compare(winningPassword, userRow.password_hash!);
      expect(isWinnerMatch).toBe(true);
    });
  });

  describe('Session & Profile (GET /auth/session, GET/PATCH /account/profile)', () => {
    it('returns session for authenticated user and rejects unauthenticated request', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!', full_name: 'Explorer One' },
      });
      const token = signUpRes.json().access_token;

      // With valid token
      const sessionRes = await app.server.inject({
        method: 'GET',
        url: '/auth/session',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(sessionRes.statusCode).toBe(200);
      expect(sessionRes.json().user.email).toBe(email);
      expect(sessionRes.json().user.user_metadata?.full_name).toBe('Explorer One');

      // Without token -> 401 unauthorized
      const unauthRes = await app.server.inject({
        method: 'GET',
        url: '/auth/session',
      });
      expect(unauthRes.statusCode).toBe(401);
      expect(unauthRes.json().error).toBe('unauthorized');

      // With expired token -> 401 token_expired
      const expiredToken = await new SignJWT({
        email,
        role: 'authenticated',
        aud: 'authenticated',
        iss: 'mindspace-api',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(signUpRes.json().user.id)
        .setExpirationTime('-1s')
        .sign(new TextEncoder().encode(app.config.JWT_SECRET));

      const expiredRes = await app.server.inject({
        method: 'GET',
        url: '/auth/session',
        headers: { authorization: `Bearer ${expiredToken}` },
      });
      expect(expiredRes.statusCode).toBe(401);
      expect(expiredRes.json().error).toBe('token_expired');
    });

    it('GET and PATCH /account/profile updates display_name', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!', full_name: 'Initial Name' },
      });
      const token = signUpRes.json().access_token;

      // GET profile
      const getRes = await app.server.inject({
        method: 'GET',
        url: '/account/profile',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.statusCode).toBe(200);
      expect(getRes.json()).toEqual({
        display_name: 'Initial Name',
        email,
      });

      // PATCH profile
      const patchRes = await app.server.inject({
        method: 'PATCH',
        url: '/account/profile',
        headers: { authorization: `Bearer ${token}` },
        payload: { display_name: 'Updated Name' },
      });
      expect(patchRes.statusCode).toBe(204);

      // Verify updated
      const getUpdatedRes = await app.server.inject({
        method: 'GET',
        url: '/account/profile',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getUpdatedRes.statusCode).toBe(200);
      expect(getUpdatedRes.json().display_name).toBe('Updated Name');
    });

    it('user B cannot read or modify user A profile (user isolation)', async () => {
      const emailA = testEmail();
      const signUpA = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email: emailA, password: 'Password123!', full_name: 'User A' },
      });
      const tokenA = signUpA.json().access_token;

      const emailB = testEmail();
      const signUpB = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email: emailB, password: 'Password123!', full_name: 'User B' },
      });
      const tokenB = signUpB.json().access_token;

      // User B calling /account/profile gets User B's profile only
      const resB = await app.server.inject({
        method: 'GET',
        url: '/account/profile',
        headers: { authorization: `Bearer ${tokenB}` },
      });
      expect(resB.json().email).toBe(emailB);
      expect(resB.json().display_name).toBe('User B');
    });

    it('an unconfigured requireUser hook rejects a token signed with an empty secret with 500 internal_error', async () => {
      const { createRequireUser } = await import('../../platform/http/auth.js');
      const unconfiguredHook = createRequireUser('');

      const tokenWithEmptySecret = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.';

      const mockReq = {
        headers: {
          authorization: `Bearer ${tokenWithEmptySecret}`,
        },
      } as any;
      const mockReply = {} as any;

      await expect(unconfiguredHook(mockReq, mockReply)).rejects.toMatchObject({
        status: 500,
        code: 'internal_error',
      });
    });
  });

  describe('Account Deletion (DELETE /account)', () => {
    it('removes user with cascades and invalidates subsequent requests', async () => {
      const email = testEmail();
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        payload: { email, password: 'Password123!', full_name: 'To Be Deleted' },
      });
      const token = signUpRes.json().access_token;
      const userId = signUpRes.json().user.id;

      // Delete account
      const delRes = await app.server.inject({
        method: 'DELETE',
        url: '/account',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(delRes.statusCode).toBe(204);

      // Verify cascade deleted all records
      const userCheck = await app.db
        .selectFrom('users')
        .select('id')
        .where('id', '=', userId)
        .executeTakeFirst();
      expect(userCheck).toBeUndefined();

      const profileCheck = await app.db
        .selectFrom('profiles')
        .select('id')
        .where('id', '=', userId)
        .executeTakeFirst();
      expect(profileCheck).toBeUndefined();

      const spacesCheck = await app.db
        .selectFrom('spaces')
        .select('id')
        .where('user_id', '=', userId)
        .execute();
      expect(spacesCheck.length).toBe(0);

      const tokensCheck = await app.db
        .selectFrom('refresh_tokens')
        .select('id')
        .where('user_id', '=', userId)
        .execute();
      expect(tokensCheck.length).toBe(0);

      // Subsequent request using old token is rejected
      const profileRes = await app.server.inject({
        method: 'GET',
        url: '/account/profile',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(profileRes.statusCode).toBe(401);
    });
  });

  describe('Security: No response contains a hash', () => {
    it('ensures no auth or account endpoint returns password_hash, token_hash, or hash patterns', async () => {
      const email = testEmail();
      const HASH_REGEX = /password_hash|token_hash|\$2[ab]\$12\$|[a-f0-9]{64}/i;

      // 1. Sign-up response
      const signUpRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-up',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!', full_name: 'Security Test' },
      });
      const signUpText = signUpRes.body;
      expect(signUpText).not.toMatch(HASH_REGEX);

      const token = signUpRes.json().access_token;
      const refreshToken = signUpRes.json().refresh_token;

      // 2. Sign-in response
      const signInRes = await app.server.inject({
        method: 'POST',
        url: '/auth/sign-in',
        headers: { 'x-client': 'mobile' },
        payload: { email, password: 'Password123!' },
      });
      expect(signInRes.body).not.toMatch(HASH_REGEX);

      // 3. Refresh response
      const refreshRes = await app.server.inject({
        method: 'POST',
        url: '/auth/refresh',
        headers: { 'x-client': 'mobile' },
        payload: { refresh_token: refreshToken },
      });
      expect(refreshRes.body).not.toMatch(HASH_REGEX);

      // 4. Session response
      const sessionRes = await app.server.inject({
        method: 'GET',
        url: '/auth/session',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(sessionRes.body).not.toMatch(HASH_REGEX);

      // 5. Profile response
      const profileRes = await app.server.inject({
        method: 'GET',
        url: '/account/profile',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(profileRes.body).not.toMatch(HASH_REGEX);
    });
  });
});
