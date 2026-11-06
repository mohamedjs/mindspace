# 08 Web on the new API

## Goal
`apps/web` runs on `apps/api` with Supabase removed. Follow `docs/fastapi-migration/06-frontend-cutover.md`, using ARCHITECTURE.md where they differ.

## Tasks
1. Create `infrastructure/api/`: fetch client with in-memory access token, single-flight refresh on 401, error mapping to `PipelineError`. One repository per port in `core/ports`. Keep `mappers.ts`.
2. Upload as one part, then `finish`, then follow SSE. Remove `runThinkingPipeline`.
3. Replace `zod` with `yup` in forms and shared schemas from `@mindspace/contracts`. Delete `app/api/*`.
4. Add a Mind Map tab to a space, rendered from `/spaces/:id/mind-map` with the existing canvas and connectors, read-only for now.
5. Performance: viewport culling on the canvas, `React.memo` on `StickyNoteItem`, cache updates in place instead of refetching, and no invalidation of all `['notes']`.
6. Add `web` to Compose. Fix all ESLint errors in files you touch.

## Acceptance checks
```
docker compose run --rm dev npm run typecheck -w @mindspace/web
docker compose run --rm dev npm test -w @mindspace/web
docker compose run --rm dev npm run build -w @mindspace/web
```
No `supabase` string remains in `apps/web/src`. Report anything from `docs/web-migration/09-parity-checklist.md` you could not verify.

## Decisions
