# 07 Billing, entitlements, jobs, cache

## Goal
Port `subscribe-start`, `subscribe-confirm`, `payments/`, and section 11 of the contract. Closes H5, H7, M4, P2.

## Logic
- `Entitlements.forUser(id)` is the only source of plan limits, cached 60 seconds in Redis, deleted on subscription change. Pipeline start rejects `ai_enabled = false` and enforces the recording cap by measured duration.
- Confirm: inside one transaction, lock the subscription, insert payment, grant credits, activate. A retry returns the same result. A failed transaction leaves nothing behind.
- TestPay works only when `ALLOW_TEST_PAY=true` and `NODE_ENV` is not production; startup fails if both conflict.
- A free plan must never replace an active paid subscription.
- Jobs in the worker, safe with several workers through `pg_try_advisory_lock`: monthly refill with true deltas, reservation sweep, and subscription expiry.
- Redis cache for models and plans, with the TTLs in ARCHITECTURE.md, working when Redis is down.

## Acceptance checks
Standard check: failure injected at each confirm step leaves a retryable state with no lost or doubled credits; a free-plan user gets `ai_not_in_plan`; TestPay is refused in production; two workers run one refill.

## Decisions
- Disk abuse: phase 05 caps each part at 25 MiB but not the number of parts. Reject `idx` at or above `ceil(maxRecordingMinutes / 5) + 2` on upload, enforce a per-user stored-audio quota from entitlements, and add a sweep deleting parts of recordings never finished within 24 hours. Test each.
