import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'kysely';
import { composeApp, type AppComposition } from '../../composition.js';
import {
  InsufficientCreditsError,
  InvalidCreditAmountError,
  ReservationNotFoundError,
  TransactionRequiredError,
} from './index.js';

describe('Credits Module (04-credits-byok)', () => {
  let app: AppComposition;

  beforeAll(async () => {
    app = await composeApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const testEmail = () =>
    `credits-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

  async function registerTestUser(name = 'Credit User') {
    const email = testEmail();
    const res = await app.server.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email,
        password: 'Password123!',
        full_name: name,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    return {
      userId: body.user.id as string,
      email,
      token: body.access_token as string,
    };
  }

  describe('Read-only Routes & Internal-Only Write Operations (C1, C2, H1)', () => {
    it('returns balance, ledger, and enabled packages on GET routes and requires auth', async () => {
      const alice = await registerTestUser('Alice');
      const bob = await registerTestUser('Bob');

      // Unauthenticated requests return 401
      const unauthBal = await app.server.inject({ method: 'GET', url: '/credits/balance' });
      expect(unauthBal.statusCode).toBe(401);

      const unauthLedger = await app.server.inject({ method: 'GET', url: '/credits/ledger' });
      expect(unauthLedger.statusCode).toBe(401);

      const unauthPkgs = await app.server.inject({ method: 'GET', url: '/credits/packages' });
      expect(unauthPkgs.statusCode).toBe(401);

      // 1. GET /credits/balance
      const balRes = await app.server.inject({
        method: 'GET',
        url: '/credits/balance',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(balRes.statusCode).toBe(200);
      expect(balRes.json()).toEqual({
        credits_balance: 100,
        credits_reserved: 0,
      });

      // 2. GET /credits/ledger
      const ledgerRes = await app.server.inject({
        method: 'GET',
        url: '/credits/ledger?limit=10&offset=0',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(ledgerRes.statusCode).toBe(200);
      const ledger = ledgerRes.json();
      expect(ledger.length).toBe(1);
      expect(typeof ledger[0].id).toBe('number');
      expect(ledger[0].delta).toBe(100);
      expect(ledger[0].balance_after).toBe(100);
      expect(ledger[0].reason).toBe('signup_grant');

      // Bob's ledger does not contain Alice's entries
      const bobLedgerRes = await app.server.inject({
        method: 'GET',
        url: '/credits/ledger',
        headers: { authorization: `Bearer ${bob.token}` },
      });
      expect(bobLedgerRes.statusCode).toBe(200);
      const bobLedger = bobLedgerRes.json();
      expect(bobLedger.length).toBe(1);
      expect(bobLedger[0].id).not.toBe(ledger[0].id);

      // 3. GET /credits/packages
      const pkgRes = await app.server.inject({
        method: 'GET',
        url: '/credits/packages',
        headers: { authorization: `Bearer ${alice.token}` },
      });
      expect(pkgRes.statusCode).toBe(200);
      const pkgs = pkgRes.json();
      expect(pkgs.length).toBeGreaterThanOrEqual(4);
      expect(pkgs[0]).toMatchObject({
        id: 'starter_50',
        name: 'Starter',
        price_egp: 50,
        base_credits: 500,
        bonus_pct: 10,
        total_credits: 550,
      });
    });

    it('exposes no HTTP route to reserve, settle, release, grant, or refill credits (C1, C2, H1)', async () => {
      const user = await registerTestUser('Attacker');

      const forbiddenRoutes = [
        { method: 'POST' as const, url: '/credits/reserve', payload: { amount: 10 } },
        { method: 'POST' as const, url: '/credits/settle', payload: { reservationId: '123', actual: 0 } },
        { method: 'POST' as const, url: '/credits/release', payload: { reservationId: '123' } },
        { method: 'POST' as const, url: '/credits/grant', payload: { amount: 1000000 } },
        { method: 'POST' as const, url: '/credits/refill', payload: {} },
        { method: 'PATCH' as const, url: '/credits/balance', payload: { credits_balance: 999999 } },
      ];

      for (const route of forbiddenRoutes) {
        const res = await app.server.inject({
          method: route.method,
          url: route.url,
          headers: { authorization: `Bearer ${user.token}` },
          payload: route.payload,
        });
        expect(res.statusCode).toBe(404);
      }

      // Attempting to tamper with credits via PATCH /account/profile
      const patchRes = await app.server.inject({
        method: 'PATCH',
        url: '/account/profile',
        headers: { authorization: `Bearer ${user.token}` },
        payload: {
          display_name: 'Legit Name',
          credits_balance: 999999,
          credits_reserved: 0,
          free_refill_at: '2000-01-01',
        },
      });
      expect(patchRes.statusCode).toBe(204);

      const balAfter = await app.creditsModule.getBalance(user.userId);
      expect(balAfter).toEqual({
        credits_balance: 100,
        credits_reserved: 0,
      });
    });
  });

  describe('Reserve, Settle, Release, and Grant Logic', () => {
    it('reserves credits with FOR UPDATE, sets 30-minute expiry, and fails with insufficient_credits when exceeding available', async () => {
      const user = await registerTestUser('Reserve User');

      // Invalid amount
      await expect(app.creditsModule.reserve(user.userId, 0)).rejects.toBeInstanceOf(
        InvalidCreditAmountError
      );
      await expect(app.creditsModule.reserve(user.userId, -5)).rejects.toBeInstanceOf(
        InvalidCreditAmountError
      );

      // Reserve 60 out of 100
      const resId1 = await app.creditsModule.reserve(user.userId, 60);
      expect(resId1).toBeDefined();

      const bal1 = await app.creditsModule.getBalance(user.userId);
      expect(bal1).toEqual({
        credits_balance: 100,
        credits_reserved: 60,
      });

      // Verify reservation expires in ~30 minutes
      const resRow = await app.db
        .selectFrom('credit_reservations')
        .select(['status', 'amount', 'created_at', 'expires_at'])
        .where('id', '=', resId1)
        .executeTakeFirstOrThrow();
      expect(resRow.status).toBe('held');
      expect(resRow.amount).toBe(60);
      const diffMinutes =
        (new Date(resRow.expires_at).getTime() - new Date(resRow.created_at).getTime()) / 60000;
      expect(diffMinutes).toBeGreaterThan(29.5);
      expect(diffMinutes).toBeLessThanOrEqual(30.5);

      // Reserve 41 when only 40 available -> fails with InsufficientCreditsError (402)
      await expect(app.creditsModule.reserve(user.userId, 41)).rejects.toMatchObject({
        name: 'InsufficientCreditsError',
        code: 'insufficient_credits',
        status: 402,
      });

      // Balance and reserved remain unchanged after failed reserve
      const bal2 = await app.creditsModule.getBalance(user.userId);
      expect(bal2).toEqual({
        credits_balance: 100,
        credits_reserved: 60,
      });
    });

    it('settles at min(actual, held), requires caller transaction, and checks ownership (H1, H6)', async () => {
      const alice = await registerTestUser('Alice Settle');
      const bob = await registerTestUser('Bob Settle');

      const resId = await app.creditsModule.reserve(alice.userId, 30);

      // 1. Settle without transaction throws TransactionRequiredError
      await expect(
        app.creditsModule.settle(resId, alice.userId, 10, null, undefined)
      ).rejects.toBeInstanceOf(TransactionRequiredError);

      // 2. Bob attempting to settle Alice's reservation fails (H1)
      await expect(
        app.db.transaction().execute((trx) =>
          app.creditsModule.settle(resId, bob.userId, 10, null, trx)
        )
      ).rejects.toBeInstanceOf(ReservationNotFoundError);

      // 3. Bob attempting to release Alice's reservation does nothing (H1)
      await app.creditsModule.release(resId, bob.userId);
      const aliceBalBefore = await app.creditsModule.getBalance(alice.userId);
      expect(aliceBalBefore.credits_reserved).toBe(30);

      // 4. If caller transaction fails after settle, settlement is rolled back
      await expect(
        app.db.transaction().execute(async (trx) => {
          await app.creditsModule.settle(resId, alice.userId, 20, null, trx);
          throw new Error('Simulated downstream work failure');
        })
      ).rejects.toThrow('Simulated downstream work failure');

      const aliceBalAfterRollback = await app.creditsModule.getBalance(alice.userId);
      expect(aliceBalAfterRollback).toEqual({
        credits_balance: 100,
        credits_reserved: 30,
      });

      // 5. Settle with actual (80) > held (30) charges min(80, 30) = 30 (closes H6)
      const actionId = '00000000-0000-4000-8000-000000000001';
      const charged = await app.db.transaction().execute((trx) =>
        app.creditsModule.settle(resId, alice.userId, 80, actionId, trx)
      );
      expect(charged).toBe(30);

      const aliceBalAfterSettle = await app.creditsModule.getBalance(alice.userId);
      expect(aliceBalAfterSettle).toEqual({
        credits_balance: 70,
        credits_reserved: 0,
      });

      // Settling again fails
      await expect(
        app.db.transaction().execute((trx) =>
          app.creditsModule.settle(resId, alice.userId, 10, null, trx)
        )
      ).rejects.toBeInstanceOf(ReservationNotFoundError);

      // 6. Settle with actual = 0 frees reservation and writes no zero-delta ledger row
      const resIdZero = await app.creditsModule.reserve(alice.userId, 20);
      const chargedZero = await app.db.transaction().execute((trx) =>
        app.creditsModule.settle(resIdZero, alice.userId, 0, null, trx)
      );
      expect(chargedZero).toBe(0);

      const ledger = await app.creditsModule.listLedger(alice.userId);
      expect(ledger.length).toBe(2); // signup_grant (+100) and usage (-30)
      expect(ledger[0].delta).toBe(-30);
      expect(ledger[0].balance_after).toBe(70);
    });

    it('releases held reservations and grants credits inside a transaction with true ledger deltas', async () => {
      const user = await registerTestUser('Grant & Release User');

      const resId = await app.creditsModule.reserve(user.userId, 45);
      expect((await app.creditsModule.getBalance(user.userId)).credits_reserved).toBe(45);

      await app.creditsModule.release(resId, user.userId);
      expect(await app.creditsModule.getBalance(user.userId)).toEqual({
        credits_balance: 100,
        credits_reserved: 0,
      });

      // Second release is a no-op
      await app.creditsModule.release(resId, user.userId);
      expect(await app.creditsModule.getBalance(user.userId)).toEqual({
        credits_balance: 100,
        credits_reserved: 0,
      });

      // Grant requires caller transaction
      await expect(
        app.creditsModule.grant(user.userId, 500, 'purchase', undefined)
      ).rejects.toBeInstanceOf(TransactionRequiredError);

      // Grant inside transaction
      const newBalance = await app.db.transaction().execute((trx) =>
        app.creditsModule.grant(user.userId, 550, 'purchase', trx, {
          packageId: 'starter_50',
          paymentRef: 'pay_ref_001',
        })
      );
      expect(newBalance).toBe(650);

      const ledger = await app.creditsModule.listLedger(user.userId);
      expect(ledger.length).toBe(2);
      expect(ledger[0].delta).toBe(550);
      expect(ledger[0].balance_after).toBe(650);
      expect(ledger[0].reason).toBe('purchase');
    });
  });

  describe('Sweep Expired Reservations (P2)', () => {
    it('releases only expired held rows and updates only affected users', async () => {
      const expiredUser = await registerTestUser('Expired Hold User');
      const activeHoldUser = await registerTestUser('Active Hold User');
      const idleUser = await registerTestUser('Idle User');

      // Expired user: one expired hold of 25, one active hold of 15
      const expResId = await app.creditsModule.reserve(expiredUser.userId, 25);
      const keepResId = await app.creditsModule.reserve(expiredUser.userId, 15);

      // Active hold user: one active hold of 30
      const activeResId = await app.creditsModule.reserve(activeHoldUser.userId, 30);

      // Force expResId to be expired in the past
      await app.db
        .updateTable('credit_reservations')
        .set({ expires_at: sql`now() - interval '1 minute'` })
        .where('id', '=', expResId)
        .execute();

      // Record Postgres xmin of unaffected users before sweep
      const beforeXmin = await sql<{ id: string; xmin: string }>`
        SELECT id, xmin::text AS xmin
          FROM profiles
         WHERE id IN (${activeHoldUser.userId}, ${idleUser.userId})
      `.execute(app.db);
      const xminMapBefore = new Map(beforeXmin.rows.map((r) => [r.id, r.xmin]));

      // Run sweep
      const sweepResult = await app.creditsModule.sweepExpiredReservations();
      expect(sweepResult.releasedCount).toBeGreaterThanOrEqual(1);
      expect(sweepResult.affectedUserIds).toContain(expiredUser.userId);
      expect(sweepResult.affectedUserIds).not.toContain(activeHoldUser.userId);
      expect(sweepResult.affectedUserIds).not.toContain(idleUser.userId);

      // Expired user's reserved is now 15 (only the non-expired hold remains)
      const expiredUserBal = await app.creditsModule.getBalance(expiredUser.userId);
      expect(expiredUserBal).toEqual({
        credits_balance: 100,
        credits_reserved: 15,
      });

      // Expired reservation is now 'released', active ones are still 'held'
      const expRow = await app.db
        .selectFrom('credit_reservations')
        .select('status')
        .where('id', '=', expResId)
        .executeTakeFirstOrThrow();
      expect(expRow.status).toBe('released');

      const keepRow = await app.db
        .selectFrom('credit_reservations')
        .select('status')
        .where('id', '=', keepResId)
        .executeTakeFirstOrThrow();
      expect(keepRow.status).toBe('held');

      const activeRow = await app.db
        .selectFrom('credit_reservations')
        .select('status')
        .where('id', '=', activeResId)
        .executeTakeFirstOrThrow();
      expect(activeRow.status).toBe('held');

      // Verify unaffected users' profile rows were NOT touched (same xmin!)
      const afterXmin = await sql<{ id: string; xmin: string }>`
        SELECT id, xmin::text AS xmin
          FROM profiles
         WHERE id IN (${activeHoldUser.userId}, ${idleUser.userId})
      `.execute(app.db);
      for (const row of afterXmin.rows) {
        expect(row.xmin).toBe(xminMapBefore.get(row.id));
      }
    });
  });

  describe('Monthly Free Refill & Ledger Reconciliation Invariant (M4)', () => {
    it('writes true delta on monthly refill and preserves credits_balance === SUM(ledger.delta) for every user', async () => {
      const u1 = await registerTestUser('Invariant User 1');
      const u2 = await registerTestUser('Invariant User 2');
      const u3 = await registerTestUser('Invariant User 3');

      // u1 spends 65 credits (balance becomes 35), and had last refill last month
      const r1 = await app.creditsModule.reserve(u1.userId, 70);
      await app.db.transaction().execute((trx) =>
        app.creditsModule.settle(r1, u1.userId, 65, null, trx)
      );
      await app.db
        .updateTable('profiles')
        .set({ free_refill_at: sql`CURRENT_DATE - interval '40 days'` })
        .where('id', '=', u1.userId)
        .execute();

      // u2 buys 500 credits (balance 600), spends 40 (balance 560), had refill last month -> should NOT be refilled since balance >= 100
      await app.db.transaction().execute((trx) =>
        app.creditsModule.grant(u2.userId, 500, 'purchase', trx)
      );
      const r2 = await app.creditsModule.reserve(u2.userId, 50);
      await app.db.transaction().execute((trx) =>
        app.creditsModule.settle(r2, u2.userId, 40, null, trx)
      );
      await app.db
        .updateTable('profiles')
        .set({ free_refill_at: sql`CURRENT_DATE - interval '40 days'` })
        .where('id', '=', u2.userId)
        .execute();

      // u3 spends 20 credits (balance 80), but was already refilled today -> should NOT be refilled again this month
      const r3 = await app.creditsModule.reserve(u3.userId, 30);
      await app.db.transaction().execute((trx) =>
        app.creditsModule.settle(r3, u3.userId, 20, null, trx)
      );

      // Run monthly refill
      const refilled = await app.creditsModule.monthlyFreeRefill();
      expect(refilled).toBeGreaterThanOrEqual(1);

      // u1 should now be back at 100, with a monthly_refill ledger entry of delta = +65 (NOT 0!)
      const u1Bal = await app.creditsModule.getBalance(u1.userId);
      expect(u1Bal.credits_balance).toBe(100);
      const u1Ledger = await app.creditsModule.listLedger(u1.userId);
      const refillEntry = u1Ledger.find((e) => e.reason === 'monthly_refill');
      expect(refillEntry).toBeDefined();
      expect(refillEntry?.delta).toBe(65);
      expect(refillEntry?.balance_after).toBe(100);

      // u2 remains at 560, u3 remains at 80
      expect((await app.creditsModule.getBalance(u2.userId)).credits_balance).toBe(560);
      expect((await app.creditsModule.getBalance(u3.userId)).credits_balance).toBe(80);

      // INVARIANT CHECK across all profiles in the database:
      // For each user, credits_balance equals the sum of ledger deltas.
      const reconciliation = await sql<{
        id: string;
        credits_balance: number;
        ledger_sum: number;
      }>`
        SELECT p.id,
               p.credits_balance::int AS credits_balance,
               COALESCE(SUM(l.delta), 0)::int AS ledger_sum
          FROM profiles p
          LEFT JOIN credit_ledger l ON l.user_id = p.id
         GROUP BY p.id, p.credits_balance
      `.execute(app.db);

      expect(reconciliation.rows.length).toBeGreaterThanOrEqual(3);
      for (const row of reconciliation.rows) {
        expect(row.credits_balance).toBe(row.ledger_sum);
      }
    });
  });

  describe('Concurrency Race Test: 50 Concurrent Reserves', () => {
    it('50 concurrent reserves on one user never exceed the balance', async () => {
      const user = await registerTestUser('Race Condition User');
      // User starts with 100 credits_balance, 0 credits_reserved.
      // Launch 50 concurrent reserves of 15 credits each.
      // At most 6 can succeed (6 * 15 = 90 <= 100).
      const outcomes = await Promise.allSettled(
        Array.from({ length: 50 }, () => app.creditsModule.reserve(user.userId, 15))
      );

      const fulfilled = outcomes.filter(
        (o): o is PromiseFulfilledResult<string> => o.status === 'fulfilled'
      );
      const rejected = outcomes.filter(
        (o): o is PromiseRejectedResult => o.status === 'rejected'
      );

      expect(fulfilled.length).toBe(6);
      expect(rejected.length).toBe(44);

      for (const rej of rejected) {
        expect(rej.reason).toBeInstanceOf(InsufficientCreditsError);
      }

      const finalBalance = await app.creditsModule.getBalance(user.userId);
      expect(finalBalance.credits_balance).toBe(100);
      expect(finalBalance.credits_reserved).toBe(90);
      expect(finalBalance.credits_reserved).toBeLessThanOrEqual(finalBalance.credits_balance);

      const heldRows = await app.db
        .selectFrom('credit_reservations')
        .selectAll()
        .where('user_id', '=', user.userId)
        .where('status', '=', 'held')
        .execute();
      expect(heldRows.length).toBe(6);
      const totalHeld = heldRows.reduce((acc, r) => acc + Number(r.amount), 0);
      expect(totalHeld).toBe(90);
    });
  });
});
