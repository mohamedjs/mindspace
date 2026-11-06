# 10 Mobile on the new API

## Goal
`apps/mobile` works on `apps/api`, keeping behaviour. Read `AGENTS.md`, `docs/IMPLEMENTATION_REFERENCE.md`, and `docs/fastapi-migration/06-frontend-cutover.md` first.

## Tasks
Add `infrastructure/api` matching the web one, with tokens in `expo-secure-store` and `X-Client: mobile`. Upload as one part, then finish, then follow status with polling every 2 seconds, because SSE is unreliable on React Native. Remove `@supabase/*`. Use Yup. Keep `eas.json` profiles, with `EXPO_PUBLIC_API_URL` per profile.

## Acceptance checks
```
docker compose run --rm dev npm run typecheck -w @mindspace/mobile
docker compose run --rm dev npm test -w @mindspace/mobile --if-present
```
No `supabase` string remains in `apps/mobile/src`. State in `notes` what needs a device test. Store builds need the owner's Apple and Google accounts, so do not attempt them.

## Decisions
