# 04 — Authorization: RLS → application layer

**This is the largest and most error-prone chunk of the migration.** Every RLS
policy in `0010_rls.sql` and later is business logic. Read this whole file
before writing a single repository method.

---

## The inversion you must understand first

Today there are **two** access paths into the data, with different rules:

```
  client ──JWT──> PostgREST ──> Postgres as role `authenticated`
                                   ↑ RLS APPLIES

  client ──JWT──> edge function ──> adminClient() = SERVICE ROLE
                                   ↑ RLS BYPASSED ENTIRELY
```

`_shared/supabase.ts` makes this explicit: `adminClient()` "bypasses RLS. Never
expose results blindly to callers", and `userClient(req)` exists *only* so
`auth.uid()` resolves inside the credit RPCs. Read the edge functions and you
see the pattern: **every write goes through `admin`**, and ownership is
re-checked by hand — `if (recording.user_id !== user.id) throw new HttpError(403, 'forbidden')`.

After the migration there is **one** path and **one** DB role:

```
  client ──JWT──> FastAPI ──> Postgres as role `mindspace`  (superuser-equivalent for the app)
                                   ↑ NO RLS. Authorization is 100% Python.
```

So the migration is not "translate policies into SQL filters". It is:

1. Every RLS policy becomes a **repository-level filter** that takes `user_id`
   as a mandatory parameter.
2. Every hand-rolled `if (row.user_id !== user.id) throw 403` in the edge
   functions becomes a **service-level ownership check**.
3. The four non-policy grants (`REVOKE SELECT (encrypted_key)`,
   `t_guard_profile`, `REVOKE EXECUTE ON grant_credits`,
   `REVOKE ALL ON delete_own_account`) become **application invariants** with
   their own tests.

The failure mode to design against: **a client-facing endpoint doing something
only an edge function could do.** There is no longer a role boundary stopping
it.

---

## A. Auth tokens {#a-auth-tokens}

**FastAPI issues tokens. Supabase Auth is removed.** Stated plainly because the
task asks for it explicitly.

### Token contract

`POST /auth/sign-in` and `POST /auth/sign-up` return:

```json
{
  "access_token": "<JWT>",
  "refresh_token": "<opaque base64url, 32 random bytes>",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": { "id": "<uuid>", "email": "…", "user_metadata": { "full_name": "…" } }
}
```

Access token claims — **deliberately shaped like GoTrue's** so nothing
downstream has to learn a new claim name:

| Claim | Value |
|---|---|
| `sub` | `users.id` (uuid string) |
| `email` | `users.email` |
| `role` | `"authenticated"` (constant; kept for shape parity) |
| `aud` | `"authenticated"` |
| `iss` | `settings.jwt_issuer` — e.g. `"mindspace-api"` |
| `iat` / `exp` | `exp = iat + 3600`, matching `config.toml`'s `jwt_expiry = 3600` |
| `user_metadata` | `{"full_name": …}` from `users.raw_user_meta_data` |
| `is_anonymous` | `users.is_anonymous` |

Algorithm **HS256**, secret `API_JWT_SECRET`. HS256 rather than RS256 because
there is one issuer and one verifier; add asymmetric keys only if a second
service ever needs to verify tokens without the signing secret.

### Compatibility story (this is also the strangler mechanism)

`app/core/security.py::decode_access_token(token)` tries, in order:

1. `jwt.decode(token, settings.api_jwt_secret, algorithms=["HS256"], audience="authenticated")`
2. **if `settings.supabase_jwt_secret` is set:**
   `jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")`

Either way it yields the same `sub` → `users.id`, because the data migration
**preserves user IDs verbatim** ([03 §A](03-data-model.md#auth-users)).

Consequences, all of them good:

- During cutover a client holding a live Supabase session can call the FastAPI
  API **without re-authenticating**. That is what makes the per-repository
  strangler cutover in [09](09-phases.md#strangler-fig-option) possible: you
  flip `container.ts` one repository at a time and both backends honour the
  same token.
- Users are not force-logged-out on release day.
- After cutover completes, unset `SUPABASE_JWT_SECRET` and step 2 disappears.
  Add a test asserting that with the setting unset, a Supabase-signed token
  yields 401.

**Mobile keeps no Supabase Auth code.** `apps/mobile/src/infrastructure/supabase/platform.ts::supabaseAuth`
is replaced by `apps/mobile/src/infrastructure/api/auth.ts` implementing the same
`AuthPort`. The `AuthPort` interface — `getSession`, `onSessionChange`, `signIn`,
`signUp`, `signOut`, `resetPassword`, `startAutoRefresh`, `stopAutoRefresh` — does
not change, so `AuthProvider.tsx` and every screen above it are untouched.
Details in [06](06-frontend-cutover.md#authport).

### The `current_user` dependency

```python
# app/modules/auth/deps.py
bearer = HTTPBearer(auto_error=False)

async def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> User:
    if creds is None:
        raise UnauthorizedError("missing Authorization header")   # 401 {"error":"unauthorized",…}
    try:
        claims = decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise UnauthorizedError()
    user = await UserRepository(session).get(UUID(claims["sub"]))
    if user is None:
        raise UnauthorizedError()
    return user
```

This is the exact replacement for `_shared/auth.ts::getUserOrThrow(req)`, down to
the 401 code `unauthorized` and the message `missing Authorization header`.

**Rule: every router in `app/modules/*/router.py` and `app/compat/` declares
`user: User = Depends(current_user)`.** The only exceptions are `/auth/sign-in`,
`/auth/sign-up`, `/auth/refresh`, `/auth/reset-password`, and `/health`. Enforce
it with a test that walks `app.routes` and asserts the dependency is present
(see [10](10-testing.md)).

---

## B. Policy-by-policy translation

### B.1 `own` — FOR ALL, `auth.uid() = user_id` (`0010_rls.sql`, `0022_note_groups.sql`)

```sql
create policy "own" on <table> for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Applies to **nine tables**: `spaces`, `recordings`, `transcripts`,
`sticky_notes`, `relationships`, `ai_actions`, `ai_action_items`,
`user_ai_keys`, `note_groups`.

**FastAPI equivalent — the mandatory-`user_id` repository rule:**

Every repository method that touches one of these tables takes `user_id: UUID`
as a **required, non-defaulted** parameter and includes it in the WHERE clause.
There is no "get by id" that does not also filter on owner.

```python
# app/modules/notes/repository.py
class NoteRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._s = session

    async def list_live(self, space_id: UUID, *, user_id: UUID) -> Sequence[StickyNote]:
        stmt = select(StickyNote).where(
            StickyNote.space_id == space_id,
            StickyNote.user_id == user_id,          # ← the RLS `using` clause
            StickyNote.deleted_at.is_(None),
        )
        return (await self._s.scalars(stmt)).all()

    async def get_owned(self, note_id: UUID, *, user_id: UUID) -> StickyNote | None:
        stmt = select(StickyNote).where(
            StickyNote.id == note_id,
            StickyNote.user_id == user_id,          # ← same
        )
        return await self._s.scalar(stmt)

    async def update_fields(self, note_id: UUID, *, user_id: UUID, **fields) -> int:
        stmt = (update(StickyNote)
                .where(StickyNote.id == note_id, StickyNote.user_id == user_id)   # ← the `using` clause
                .values(**fields))
        return (await self._s.execute(stmt)).rowcount
```

Three properties this gets you, matching RLS semantics exactly:

| RLS behaviour | Python equivalent |
|---|---|
| `USING` on SELECT: another user's row is **invisible**, not forbidden | `get_owned` returns `None` → service raises `NotFoundError` (404), **not** 403. Matches: a cross-user `SELECT … .single()` in PostgREST returns "no rows" |
| `USING` on UPDATE/DELETE: the statement affects **0 rows** silently | `rowcount == 0` → service raises `NotFoundError` (404) |
| `WITH CHECK` on INSERT: you cannot insert a row owned by someone else | `user_id` is **never read from the request body**; it is always `user.id` from the token. Insert schemas literally do not have the field |

**The `WITH CHECK` half is the one people forget.** In Supabase the client sends
no `user_id` at all — the column defaults to `auth.uid()` (see `0007_core.sql`:
`user_id uuid not null default auth.uid()`). In FastAPI drop that default and
set it in the service:

```python
note = StickyNote(user_id=user.id, space_id=space_id, ...)   # user.id, never body.user_id
```

**Nested ownership is a second check, not a substitute.** A note belongs to a
space; RLS checked only `sticky_notes.user_id`. Reproduce exactly that — do
*not* "improve" it by joining through `spaces`, because that changes behaviour
for any row where the two disagree. But **do** verify the parent when creating:
`POST /spaces/{space_id}/notes` must call
`SpaceService.get_owned(space_id, user_id)` first and 404 if absent, or a user
could seed notes into someone else's space (RLS's `WITH CHECK` on
`sticky_notes` would have allowed that too — it only checked `user_id` — but
the FK plus `spaces` RLS made the space unreadable. Closing it is a strict
improvement with no behavioural downside).

### B.2 `own` — FOR SELECT only (`timeline_events`)

```sql
create policy "own" on timeline_events for select using (auth.uid() = user_id);
```

No `for all`. The client could **read** its timeline but never write one — all
writes came from the `on_note_change()` SECURITY DEFINER trigger.

**FastAPI:** `TimelineRepository` exposes `list_by_space(space_id, *, user_id)`
and `insert(...)`. `insert` is called **only** from `TimelineService.record_note_event`,
which is called **only** from `notes` and `ai`. There is no `POST` route on
`/spaces/{id}/timeline`. Test: assert no route with method `POST`/`PUT`/`PATCH`/`DELETE`
exists under `/timeline`.

### B.3 `profiles` — split read/update

```sql
create policy "read own"         on profiles for select using (auth.uid() = id);
create policy "update own prefs" on profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);
```

Note there is **no INSERT policy and no DELETE policy** on `profiles`. Inserts
came only from `handle_new_user()`. Deletes came only from the `users` cascade.

**FastAPI:**

| Operation | Allowed from | Route |
|---|---|---|
| SELECT own profile | `AccountService.get_profile`, `ModelService.get_preferences`, `CreditService.get_balance`, `ai`'s timezone lookup | `GET /account/profile`, `GET /models/preferences`, `GET /credits/balance` |
| UPDATE `display_name` | `AccountService.update_display_name` | `PATCH /account/profile` |
| UPDATE `chat_model_id` / `transcribe_model_id` | `ModelService.set_preference` | `PUT /models/preferences` |
| UPDATE `credits_balance` / `credits_reserved` | `CreditRepository` **only** | *no route* |
| INSERT | `AuthService.register` **only** | *no route* |
| DELETE | cascade from `users` | *no route* |

The "prefs" in "update own prefs" was enforced by the `t_guard_profile` trigger,
not by the policy — see Guard 1 below.

### B.4 Money tables — SELECT only from the client

```sql
create policy "read own" on credit_ledger       for select using (auth.uid() = user_id);
create policy "read own" on credit_reservations for select using (auth.uid() = user_id);
create policy "read own" on payments            for select using (auth.uid() = user_id);
create policy "read own" on subscriptions       for select using (auth.uid() = user_id);   -- 0024
```

Comment in `0010_rls.sql`: *"Money tables: READ ONLY from client. Writes via
SECURITY DEFINER RPCs only."* And in `0024`: *"a client that could insert here
would grant itself a plan."*

**FastAPI:** these four tables get repositories with a hard split:

- `list_*(user_id=…)` / `get_*(user_id=…)` — reachable from routers.
- `insert_*` / `update_*` — reachable **only** from `CreditService` (ledger,
  reservations) and `SubscriptionService` (payments, subscriptions).

There is no route that accepts a body which writes these tables directly. The
only client-triggered writes are:
`POST /billing/subscriptions` (creates a `pending` subscription — matches
`subscribe-start`), `POST /billing/subscriptions/{id}/confirm`, and the credit
reserve/settle that happens **inside** the AI pipeline, never as its own
endpoint.

### B.5 Catalogue tables — read all, gated on `enabled`

```sql
create policy "read models"   on ai_models         for select to authenticated using (enabled);   -- 0004
create policy "read all"      on credit_packages   for select using (enabled);                    -- 0010
create policy "read enabled"  on subscription_plans for select using (enabled);                    -- 0024
```

No user scoping — every signed-in user sees the same catalogue. But **the
`enabled` filter is business logic, not decoration**: `0027` disables BYOK
transcribe models and non-`{openai,anthropic,google}` BYOK chat models
precisely so "the picker and the server agree on the same short list".

**FastAPI:**

```python
async def list_enabled(self) -> Sequence[AiModel]:
    return (await self._s.scalars(
        select(AiModel).where(AiModel.enabled.is_(True))
                       .order_by(AiModel.kind, AiModel.sort_order)
    )).all()
```

The only method on these three repositories that a router may call is the
`enabled`-filtered one. `resolve_model` and `resolve_api_key` **also** filter on
`enabled` internally (`_shared/models.ts` does `.eq('enabled', true)` in all
three branches) — keep that; it is a second, independent gate.

Auth is still required (`to authenticated`): `GET /models`, `GET /billing/plans`,
`GET /credits/packages` all take `Depends(current_user)`.

### B.6 Storage object policies (`0013_storage.sql`)

```sql
bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text
```
for INSERT, SELECT and DELETE.

**FastAPI:**

```python
# app/modules/storage/service.py
def assert_owns(self, key: str, user_id: UUID) -> None:
    first_segment = key.split("/", 1)[0]
    if first_segment != str(user_id):
        raise ForbiddenError("forbidden")
```

Called before every presign (PUT and GET) and before every delete. Because the
API brokers all S3 access via presigned URLs and MinIO's bucket stays private,
the check happens once, server-side, and the presigned URL is the capability.

Additional validation that the bucket config used to do:

| Bucket setting | Now enforced at |
|---|---|
| `file_size_limit = 26214400` | `PresignUploadRequest.size_bytes: int = Field(le=26_214_400)`, plus MinIO bucket policy if you want defence in depth |
| `allowed_mime_types = ['audio/m4a','audio/mp4','audio/mpeg','audio/wav']` | `PresignUploadRequest.content_type: Literal[…]`. **Careful:** web MediaRecorder produces `audio/webm`, which the *current* bucket rejects — `platform.ts` (web) coerces anything not in the list to `audio/mp4` while the extension it stores may be `webm`. Reproduce the coercion; do not "fix" it here |
| `public = false` | MinIO bucket created private by the `migrate` service; no anonymous policy |

---

## C. The four non-policy artifacts (the ones that get hand-waved)

These are not policies, they are grants and triggers, and each carries a rule
that has nowhere to live after the migration except application code.

### Guard 1 — `t_guard_profile` {#guard-1}

`0010_rls.sql` + `0017_fix_credit_guard.sql`:

```sql
create or replace function guard_profile_update() returns trigger as $$
begin
  if new.credits_balance  is distinct from old.credits_balance
  or new.credits_reserved is distinct from old.credits_reserved then
    raise exception 'credits are read-only from the client';
  end if;
  return new;
end $$;

create trigger t_guard_profile before update on profiles
  for each row when (current_user in ('authenticated', 'anon'))
  execute function guard_profile_update();
```

The `0017` fix is instructive: the guard originally keyed off
`current_setting('role')`, which PostgREST sets once per request and which
`SECURITY DEFINER` does not change — so the guard fired **inside**
`reserve_credits` and *"every credit reservation raised 'credits are read-only
from the client'. That made transcription fail for every user with a platform
key."* The role distinction is exactly what disappears in FastAPI.

**Application invariant, three layers:**

1. **No client-facing request schema contains `credits_balance` or
   `credits_reserved`.** `ProfilePatch` has `display_name` only.
   `ModelPreferencesPatch` has `chat_model_id` / `transcribe_model_id` only.
   Both are `model_config = ConfigDict(extra="forbid")` so an extra field is a
   422, not a silent ignore.
2. **Only `app/modules/credits/repository.py` may emit an UPDATE naming those
   columns.** Enforce with a grep test:
   ```python
   def test_only_credits_repo_writes_balance():
       offenders = [p for p in Path("app").rglob("*.py")
                    if p != Path("app/modules/credits/repository.py")
                    and re.search(r"credits_(balance|reserved)\s*[=:]", p.read_text())]
       assert offenders == []
   ```
3. **Optionally keep the DB trigger too**, rewritten without the role check:
   a `BEFORE UPDATE` trigger that raises unless
   `current_setting('mindspace.allow_credit_write', true) = 'on'`, with
   `CreditRepository` doing `SET LOCAL mindspace.allow_credit_write = 'on'`
   inside its transaction. This is belt-and-braces; layers 1 and 2 are the
   requirement. Decide once and record it — do not half-implement it.

### Guard 2 — `revoke select (encrypted_key) on user_ai_keys from authenticated` {#guard-2}

`0005_user_ai_keys.sql`: *"The client must NEVER be able to read the encrypted
key blob."* Column-level `REVOKE` — the strongest form, and `repositories.ts`'s
comment leans on it: *"encrypted_key is revoked from SELECT at the DB level
(migration 0005), so widening this list can never leak it."*

**That safety net is gone.** After the migration the only thing between the
ciphertext and the wire is the response model.

**Application invariant:**

1. `UserKeyOut` lists fields explicitly, matching what
   `supabaseKeyRepository.list()` selects today:
   `id, provider, label, key_hint, is_active, last_error, created_at`.
   Never `encrypted_key`, never `base_url` (it is not selected today either).
2. `KeyRepository.list_for_user` **selects columns, not the entity**:
   ```python
   select(UserAiKey.id, UserAiKey.provider, UserAiKey.label, UserAiKey.key_hint,
          UserAiKey.is_active, UserAiKey.last_error, UserAiKey.created_at)
   ```
   so the blob is never even loaded on the read path.
3. Only `resolve_api_key()` loads `encrypted_key`, and it returns a decrypted
   string into a local variable that goes to the provider and nowhere else.
   **Never log it**; `app/core/logging.py` gets a redaction filter for anything
   named `api_key`, `apiKey`, `encrypted_key`, `authorization`, `password`.
4. Test: `test_key_list_never_leaks_ciphertext` asserts the JSON body of
   `GET /keys` contains none of `encrypted_key`, `\\x`, or the plaintext.

### Guard 3 — `revoke execute on function grant_credits from authenticated, anon`

`0011_credit_rpcs.sql`. `grant_credits` mints credits. Only
`subscribe-confirm`, running under the service role, could call it.

**Application invariant:** `CreditService.grant()` exists, and the module
dependency rule ([02](02-target-architecture.md#dependency-rules-enforce-with-an-import-lint-test--see-10))
allows exactly one caller: `billing`. Test:

```python
def test_grant_credits_has_exactly_one_caller():
    hits = [p for p in Path("app").rglob("*.py") if "CreditService" in p.read_text()
            and ".grant(" in p.read_text()]
    assert {str(p) for p in hits} == {"app/modules/billing/service.py"}
```

And an ordering test mirroring `subscribe-confirm`'s docstring — *"Granting
before recording would let a retried confirm mint credits twice, and
credit_ledger is append-only"*: verify → insert `payments` → **then** grant.
A test that calls `confirm()` twice with the same receipt and asserts the
balance moved once.

### Guard 4 — `delete_own_account` grants

`0020_delete_own_account.sql`:
```sql
revoke all on function public.delete_own_account() from public;
grant execute on function public.delete_own_account() to authenticated;
```

Plus, inside the function, `if uid is null then raise exception 'not_authenticated'`.

**Application invariant:** `DELETE /account` requires `Depends(current_user)`
and deletes `user.id` — it takes **no path or body parameter naming a user**.
That is the whole rule, and it is easy to break by "helpfully" adding
`DELETE /users/{user_id}`. Test: assert no route path in the app contains
`{user_id}`.

Also flag the factual error in that migration's comment while porting it:
it claims *"spaces.user_id / user_ai_keys.user_id carry no FK (RLS-only
ownership)"* — but `0007_core.sql` and `0005_user_ai_keys.sql` both declare
`references auth.users on delete cascade`. The explicit deletes are redundant
belt-and-braces. Keep them (harmless, and they make the intent readable), but do
not build any new logic on the false premise.

---

## D. The hand-rolled checks in edge functions

These are not RLS, but they are authorization, and they must survive. Every one
of them was `admin`-client code re-checking ownership by hand:

| Edge function | Check | FastAPI |
|---|---|---|
| `transcribe` | `if (recording.user_id !== user.id) throw 403 'forbidden'` | `RecordingService.get_owned(recording_id, user_id)` → 404/403 |
| `transcribe` | `if (!recording.storage_path) throw 400 'recording_not_uploaded'` | Same code, same status |
| `ai-extract` | `if (transcript.user_id !== user.id) throw 403 'forbidden'` | `TranscriptRepository.get_owned` |
| `ai-extract` | `focusNote` is looked up **within the space's live notes** — *"a bad/foreign id can't attach notes to someone else's board"*. Missing → 404 `parent_note_not_found` | Load `existing` filtered by `space_id` + `user_id` + `deleted_at is null`, then look `parent_note_id` up **inside that list**. Do not do a separate `SELECT … WHERE id = parent_note_id` |
| `ai-extract` | `spaceId` from the body is used for the insert **without an ownership check** — RLS on `sticky_notes` never checked the space either | **Close it:** call `SpaceService.get_owned(space_id, user_id)` first. Strict improvement, no behavioural downside (a foreign space_id fails today anyway, just later and with a worse error) |
| `ai-note-write` | `transcript.user_id !== user.id` → 403; `note.user_id !== user.id` → 403; note must have `deleted_at is null` | Two `get_owned` calls |
| `byok-delete` | `.eq('id', keyId).eq('user_id', user.id)` | `delete … where id = :id and user_id = :uid`; `rowcount == 0` → 404 |
| `subscribe-confirm` | `if (subscription.user_id !== user.id) throw 403 'forbidden'` | `SubscriptionRepository.get_owned` |

**Status-code note:** the edge functions return **403 `forbidden`** for
cross-user access on these paths, while PostgREST/RLS returned "not found". Keep
each path's *current* behaviour rather than unifying — the clients' error
mapping (`shared/constants/errors.ts`, `features/voice/services/pipelineErrors.ts`)
is written against what exists. The authorization matrix in
[10](10-testing.md#authorization-test-matrix) pins the expected status per
endpoint.

---

## E. Summary table — every table, its old rule, its new home

| Table | RLS today | New enforcement | Client-writable? |
|---|---|---|---|
| `users` (was `auth.users`) | GoTrue-internal | `current_user` dependency; no route names a user id | No (except own account delete) |
| `profiles` | select own / update own | `AccountService` + `ModelService` (identity), `CreditRepository` (money) | Partially — `display_name`, model prefs only |
| `spaces` | `own` FOR ALL | `SpaceRepository(user_id=…)` | Yes |
| `sticky_notes` | `own` FOR ALL | `NoteRepository(user_id=…)` | Yes |
| `relationships` | `own` FOR ALL | `RelationshipRepository(user_id=…)` | Yes (no client uses it today) |
| `note_groups` | `own` FOR ALL | `GroupRepository(user_id=…)` | Yes |
| `recordings` | `own` FOR ALL | `RecordingRepository(user_id=…)` | Yes (create/markFailed/markCompleted) |
| `transcripts` | `own` FOR ALL | `TranscriptRepository(user_id=…)` | Read only in practice |
| `ai_actions` | `own` FOR ALL | `AiActionRepository(user_id=…)` | No route writes them |
| `ai_action_items` | `own` FOR ALL | `AiActionRepository(user_id=…)` | No route writes them |
| `timeline_events` | `own` FOR **SELECT** | `TimelineRepository`; insert callable only from `notes`/`ai` | **No** |
| `user_ai_keys` | `own` FOR ALL **+ column REVOKE** | `KeyRepository(user_id=…)` + `UserKeyOut` field list | Yes, via `/keys` |
| `credit_ledger` | select own | `CreditRepository`; append-only | **No** |
| `credit_reservations` | select own | `CreditRepository` | **No** |
| `payments` | select own | `SubscriptionService` | **No** |
| `subscriptions` | select own | `SubscriptionService` | Only via start/confirm |
| `ai_models` | select where `enabled` | `AiModelRepository.list_enabled` | **No** |
| `credit_packages` | select where `enabled` | `CreditPackageRepository.list_enabled` | **No** |
| `subscription_plans` | select where `enabled` | `PlanRepository.list_enabled` | **No** |
| `storage.objects` (bucket `recordings`) | path prefix == uid | `StorageService.assert_owns` | Via presign only |
| `refresh_tokens` *(new)* | — | Hash lookup, `user_id` scoped, rotate on use | **No** |
| `password_reset_tokens` *(new)* | — | Single-use, expiring | **No** |
