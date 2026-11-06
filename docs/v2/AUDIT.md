# MindSpace audit, 2026-11-07

Scope: `main` at `0531182`. Backend (`supabase/`) and `apps/web`.
**Not audited:** `apps/mobile`, `apps/mcp`, deployed edge-function secrets, and real load. Performance findings come from reading code, not profiling.

Evidence labels:
- **Live:** read from the production catalog with a read-only query. No exploit was run and no data was read.
- **Reproduced:** executed against a local Postgres using the repo's real SQL.
- **Code:** confirmed by reading the cited lines, not executed.

Baseline: `tsc` clean, 113 of 113 web tests pass, 47 ESLint errors. Edge functions, which hold all the money logic, have no tests.

## Critical: fix on production now

### C1. Anyone can mint credits (Live, Reproduced)
`supabase/migrations/0011_credit_rpcs.sql:88` revokes from `authenticated, anon`, but Postgres grants function execution to `PUBLIC`, and that grant survives. Production reports `grant_credits` executable by both `authenticated` and `anon`. The anon key ships in every client. A local run of the same statements minted 1,000,000 credits as `authenticated`.

### C2. Unlimited free refills (Reproduced, function executable Live)
`monthly_free_refill` is also client-callable. `guard_profile_update` (`0010_rls.sql:42`) protects only the balance columns, so a user can clear their own `free_refill_at` and call the function, returning to 100 credits at will.

## High

| # | Finding | Evidence | Where |
|---|---|---|---|
| H1 | `settle_credits` and `release_credits` have no owner check. One user released another's reservation. Releasing your own mid-request makes the later settle fail after the transcript is saved, so the work is free. | Reproduced, executable Live | `0011:30,58`, `transcribe/index.ts:106,129` |
| H2 | `ai-extract` never checks that `spaceId` belongs to the caller. Foreign notes go to the LLM and new notes land on a foreign board. Requires knowing the UUID. | Code | `ai-extract/index.ts:57,86-90,267` |
| H3 | `transcribe` sets `recordingId` before the owner check, and its catch block updates that row with the service role. Any user can mark another's recording failed. Requires knowing the UUID. | Code | `transcribe/index.ts:41,50,146-150` |
| H4 | The charge uses `duration_ms`, which the client writes. Set it to 1 and up to 25 MB of audio costs 1 credit. | Code | `transcribe/index.ts:65-66`, `0010_rls.sql:23` |
| H5 | Plans are enforced only in the UI. No function checks `ai_enabled` or `max_recording_minutes`, so the free no-AI plan works through direct calls. | Code | grep of `supabase/functions` |
| H6 | `actual` is uncapped. When it exceeds the balance, settle hits the check constraint after notes are inserted. The user gets free notes and a 500, and a retry creates duplicates. | Reproduced (constraint) | `ai-extract/index.ts:141-143,265,306`, `pipeline.ts` |
| H7 | Confirming a payment is three separate writes. If the grant fails, a retry hits the unique index and returns `alreadyActive` with no credits. The customer paid and received nothing. Not exposed until real payments exist. | Code | `subscribe-confirm/index.ts:79,92,104,116` |

## Medium

| # | Finding | Evidence | Where |
|---|---|---|---|
| M1 | `byok-save` accepts any `baseUrl`, and the server then calls it. That is server-side request forgery. | Code | `byok-save/index.ts:14,44`, `keys.ts:185` |
| M2 | Only OpenRouter keys are validated, yet the product supports OpenAI, Anthropic and Google, so a bad key saves as valid. | Code | `byok-save/index.ts:7,22` |
| M3 | `resolveApiKey` ignores its query error. Two active keys for a provider make `maybeSingle` fail, which silently uses the platform key and charges credits. `NULL` labels never conflict, so an unlabelled re-save can create that state. | Code | `keys.ts:167-175`, `0005:16`, `byok-save:37-49` |
| M4 | Refill writes `delta = 0` to the ledger while the balance rises, so the ledger cannot reconcile. | Reproduced | `0011:102` |
| M5 | `ai-note-write` inserts status `applied`, which the enum lacks, and ignores the failure. Note writes have no audit row. | Code | `ai-note-write/index.ts:130` |
| M6 | Results of the `ai_action_items` and `relationships` inserts are ignored, so undo data and links can vanish silently. | Code | `ai-extract/index.ts:273,289` |
| M7 | Production has drifted from migrations. The live bucket allows `webm`, `ogg` and `x-m4a`, while `0013` does not, so a fresh environment would reject browser recordings. | Live | `0013_storage.sql:7` |
| M8 | Internal text reaches clients: raw exception messages and provider response bodies. | Code | `lib/api/http.ts:32`, `openaiCompatible.ts:100` |
| M9 | The function proxy forwards any `name` without an allow-list. | Code | `app/api/functions/[name]/route.ts` |
| M10 | The pipeline runs in the browser. Closing the tab leaves a recording stuck in progress. | Code | `features/voice/services/pipeline.ts` |

## Bottlenecks

| # | Finding | Effect as usage grows | Where |
|---|---|---|---|
| P1 | Every note in a space, with full content, is added to the prompt with no limit. | Cost and latency rise with board size, then hit the 60-second cap | `ai-extract/index.ts:86-90,119`, `extractThoughts.ts:245` |
| P2 | The hourly sweep updates every row in `profiles`, not just those with reservations. | Write load scales with total users, not active ones | `0012_cron.sql:12-14` |
| P3 | Transcription has a 60-second cap, or no timeout at all on the other path. | Long recordings fail, or a call hangs | `openaiCompatible.ts:45,121` |
| P4 | The canvas renders every note with no viewport culling, and `StickyNoteItem` is not memoized. | Interaction slows as boards grow | `CanvasRoot.tsx:940`, `StickyNoteItem.tsx:48` |
| P5 | Changing one colour refetches all cached note lists, and lists have no pagination. | Needless reads | `useNotes.ts:62`, `noteRepository.ts:8` |
| P6 | Audio is held fully in memory and base64-encoded. | Memory per job is several times file size | `transcribe/index.ts:82`, `openaiCompatible.ts:150` |

## Maintainability

- `CanvasRoot.tsx` is 1,054 lines.
- ESLint errors: 18 `no-explicit-any`, 15 `static-components`, 10 `set-state-in-effect`, 3 `refs`, 1 other.

## Hotfix for production, not yet applied

Stops C1 and C2 and closes the cross-user part of H1. It does not stop a user releasing their own reservation; v2 ends that by moving credits behind the server.

```sql
revoke execute on function public.grant_credits(uuid,int,ledger_reason,text,text) from public, anon, authenticated;
revoke execute on function public.monthly_free_refill() from public, anon, authenticated;
grant execute on function public.grant_credits(uuid,int,ledger_reason,text,text) to service_role;
revoke execute on function public.reserve_credits(int,text) from public, anon;
revoke execute on function public.settle_credits(uuid,int,uuid) from public, anon;
revoke execute on function public.release_credits(uuid) from public, anon;

create or replace function public.release_credits(p_reservation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_held int;
begin
  select user_id, amount into v_user, v_held from credit_reservations
   where id = p_reservation and status = 'held' and user_id = auth.uid() for update;
  if v_user is null then return; end if;
  update profiles set credits_reserved = credits_reserved - v_held where id = v_user;
  update credit_reservations set status = 'released' where id = p_reservation;
end $$;

create or replace function public.settle_credits(p_reservation uuid, p_actual int, p_ai_action uuid) returns int
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_held int; v_bal int;
begin
  select user_id, amount into v_user, v_held from credit_reservations
   where id = p_reservation and status = 'held' and user_id = auth.uid() for update;
  if v_user is null then raise exception 'reservation not found or already settled'; end if;
  if p_actual < 0 then raise exception 'actual must be >= 0'; end if;
  update profiles set credits_reserved = credits_reserved - v_held, credits_balance = credits_balance - p_actual
   where id = v_user returning credits_balance into v_bal;
  update credit_reservations set status = 'settled', ai_action_id = p_ai_action where id = p_reservation;
  if p_actual > 0 then
    insert into credit_ledger (user_id, delta, balance_after, reason, ai_action_id)
    values (v_user, -p_actual, v_bal, 'usage', p_ai_action);
  end if;
  return v_bal;
end $$;

create or replace function public.guard_profile_update() returns trigger
language plpgsql as $$
begin
  if new.credits_balance is distinct from old.credits_balance
  or new.credits_reserved is distinct from old.credits_reserved
  or new.free_refill_at is distinct from old.free_refill_at then
    raise exception 'credits are read-only from the client';
  end if;
  return new;
end $$;
```

Tested locally against the repo's real functions. After applying, re-run the privilege query and record a real transcription to confirm reserve, settle and release still work. Also review `credit_ledger` for `purchase` rows with no matching `payments` row, since C1 has been open since `0011`.
