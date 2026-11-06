# 04 Credits and BYOK

## Goal
A correct money module. Port `0011_credit_rpcs.sql`, `_shared/credits.ts`, `crypto.ts`, `keys.ts`, `byok-*`. Closes C1, C2, H1, M1 to M4.

## Logic
- `CreditService` is internal: no route can reserve, settle, release or grant. Routes are read-only balance, ledger and packages.
- `reserve(userId, amount, tx?)`: `SELECT ... FOR UPDATE` on the profile, fail with `insufficient_credits`.
- `settle(reservationId, userId, actual, aiActionId, tx)`: charge `min(actual, held)`. Requires the caller's transaction, so a charge commits together with the work it pays for.
- `release`, `grant(tx)`: every balance change writes a ledger row with its true delta.
- Reservations expire after 30 minutes. A sweep releases only expired rows, then adjusts only affected users.
- Invariant test: for each user, `credits_balance` equals the sum of ledger deltas.
- Race test: 50 concurrent reserves on one user never exceed the balance.
- BYOK: AES-256-GCM, byte-compatible with `crypto.ts`. Providers allow-listed to `openai`, `anthropic`, `google`. No custom base URL. Every key is validated with a live, cheap call through a `KeyValidator` port, faked in tests. Saving replaces the existing key for that provider. Keys never leave the module apart from `resolveKey` for `ai`.

## Acceptance checks
Standard check with all tests named above.

## Out of scope
Billing routes.

## Decisions
