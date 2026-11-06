# 03 Spaces, notes, groups, relations, timeline

## Goal
Port sections 3, 4, 5, 13 and 16 of `docs/fastapi-migration/05-api-contract.md`, plus every behaviour under "Behavioural details that must survive verbatim".

## Logic
- Port these triggers into services inside transactions: note counts, `last_activity_at`, timeline events, child promotion on delete. Read the triggers in `supabase/migrations/` and in `docs/fastapi-migration/01-current-surface.md`.
- Position changes must not write timeline events.
- `POST /notes/move` updates all rows in one statement, after verifying all ids belong to the caller. Limit 500.
- Cycle guard on parent changes.
- Add `GET /spaces/:id/mind-map` returning `{nodes, edges}` from live notes and relationships. Server-side tree building only; layout stays on the client.

## Acceptance checks
Standard check, with an authorization matrix covering every route for a foreign user, plus cycle, soft delete, promotion and bulk move limit tests.

## Out of scope
Recordings, AI.

## Decisions
