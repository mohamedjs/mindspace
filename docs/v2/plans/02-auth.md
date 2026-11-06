# 02 Auth and account

## Goal
Port authentication and account routes from section 1 and 2 of `docs/fastapi-migration/05-api-contract.md`, with tokens from `04-authorization.md`.

## Module
`apps/api/src/modules/auth`, in the standard layers. Exposes a `requireUser` Fastify hook through `platform/http`, and a `currentUserId(req)` helper.

## Logic
- Sign-up: bcrypt cost 12, create user, profile, default space and 100 credits in one transaction. Use ports for spaces and credits, or a seed port; `credits_balance` must still be written only by `credits/infrastructure`, so phase 04 owns that repository: create a minimal `credits` module here with only `grantSignup`.
- Access token: HS256 by `jose`, 15 minutes, `sub` and `jti`. Refresh token: 256-bit random, stored as SHA-256, 30 days, rotated on use. Reuse of a rotated token revokes the whole family.
- Web gets the refresh token in an `httpOnly`, `Secure` outside development, `SameSite=Lax` cookie. Clients sending `X-Client: mobile` or `extension` get it in JSON.
- Sign-in has the same response and timing for unknown email and wrong password. Rate limit 10 per minute per IP plus email.
- Password reset always returns 202. Tokens are single-use, hashed, valid 30 minutes. Email goes through a `Mailer` port with a logging adapter in development.
- Delete account: transaction removes the user with cascades, and audio files are removed after commit.

## Acceptance checks
Standard check, including tests for rotation, reuse revocation, duplicate email, expired token, reset single use, and that no response contains a hash.

## Out of scope
OAuth, email verification, other modules.

## Decisions
