# v2 build plans

Run in order. Each file is one `delegate.sh build` run.
Binding: `docs/v2/ARCHITECTURE.md`, then `docs/v2/AUDIT.md`. Each plan's Acceptance checks must pass before the next starts.

| # | Plan | Model |
|---|---|---|
| 01 | Foundation | flash |
| 02 | Auth and account | flash |
| 03 | Spaces, notes, groups, relations, timeline | flash |
| 04 | Credits and BYOK | argon |
| 05 | Recordings, parts, queue, transcription, SSE | argon |
| 06 | AI extraction, note writing | flash |
| 07 | Billing, entitlements, jobs, cache | argon |
| 08 | Web on the new API | flash |
| 09 | Meeting extension and mind map | flash |
| 10 | Mobile on the new API | flash |
| 11 | Landing page and GitHub Action | flash |
| 12 | Production hardening | argon |

## Rules for every phase
- UI work on the canvas follows `docs/v2/TOOLBAR.md`.
- Follow the module layout and dependency rules. Port behaviour from `supabase/functions/`, and fix each `AUDIT.md` finding as you port. Never copy a listed bug.
- Run everything through Compose: `docker compose run --rm dev <command>`. Do not install on the host.
- Tests use the Compose Postgres and Redis. Each module gets an authorization test proving user B gets 404 on user A's rows.
- Never read `.env` values outside development placeholders, and never connect to Supabase or any production system.
- Tests use the `mindspace_test` database, rebuilt on every run. Atomic state changes must use conditional updates, and work done before throwing inside a transaction is rolled back.
- Standard check for every backend phase: `docker compose run --rm dev npm run check -w @mindspace/api`, which runs typecheck, lint and tests.

## If Claude's limit runs out
Run `agy --model gemini-4-argon-high`, then `/implement-plan docs/v2/plans/<next>.md`. `STATUS.md` here says what is finished.
