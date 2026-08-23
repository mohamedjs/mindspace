# 10 — Testing strategy

The single question this suite has to answer is: **can user A ever see or touch
user B's data?** RLS used to answer it structurally. Now only tests do.

## Layout

```
services/api/tests/
├── conftest.py
├── factories.py
├── test_architecture.py          # module dependency lint
├── test_error_envelope.py        # {"error","message"} on every failure path
├── test_route_shape.py           # auth dependency present, no {user_id} paths, no timeline writes
├── test_authorization_matrix.py  # ← the important one
├── modules/
│   ├── test_auth.py
│   ├── test_spaces.py
│   ├── test_notes.py
│   ├── test_timeline.py
│   ├── test_recordings.py
│   ├── test_storage.py
│   ├── test_ai_extraction.py
│   ├── test_ai_layout.py
│   ├── test_credits.py
│   ├── test_byok_crypto.py
│   ├── test_byok_resolver.py
│   └── test_billing.py
└── compat/
    └── test_functions_router.py
```

## Fixtures (`conftest.py`)

```python
@pytest.fixture(scope="session")
def event_loop(): ...

@pytest.fixture(scope="session")
async def engine():
    # Against the compose `postgres` service, DB name `mindspace_test`.
    # Alembic upgrade head once per session — this also proves the baseline runs.
    ...

@pytest.fixture
async def session(engine):
    # Outer transaction + SAVEPOINT, rolled back after every test.
    # Fast, and it keeps tests order-independent.
    conn = await engine.connect(); trans = await conn.begin()
    s = AsyncSession(bind=conn, join_transaction_mode="create_savepoint")
    yield s
    await s.close(); await trans.rollback(); await conn.close()

@pytest.fixture
async def app_client(session):
    app.dependency_overrides[get_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
async def alice(session) -> UserCtx: ...   # user + profile + space + 1000 credits + token
@pytest.fixture
async def bob(session)   -> UserCtx: ...   # a second, unrelated user

@pytest.fixture
def as_alice(app_client, alice): ...       # client with alice's bearer token bound
@pytest.fixture
def as_bob(app_client, bob): ...
```

Use the real Postgres from compose, not SQLite. The schema uses native enums,
partial indexes, generated columns, `bytea`, `jsonb` and `FOR UPDATE`; SQLite
would test a different program.

Stub the AI providers with a fixture that patches
`app.modules.ai.providers.openai_compatible.create_provider`; never let a test
hit a real model. Stub MinIO with `moto` or a real MinIO from compose — a real
one is simpler and already running.

---

## Authorization test matrix {#authorization-test-matrix}

This mirrors [04](04-authorization.md) row for row. **It is parametrised over
the table list**, so adding a table without adding it here fails the suite.

### A. Cross-user isolation — the core matrix

For every owned table, seed a row for **bob**, then attempt every operation as
**alice** and assert she cannot observe or modify it.

```python
OWNED_ENDPOINTS = [
    # (name, seed_fn, read_path, write_method, write_path, write_body, expected_status)
    ("space",      seed_space,   "/spaces",                          "PATCH",  "/spaces/{id}",             {"name":"x"},          404),
    ("note",       seed_note,    "/spaces/{space_id}/notes",         "PATCH",  "/notes/{id}/content",      {"content":"x"},       404),
    ("note_pos",   seed_note,    None,                               "PATCH",  "/notes/{id}/position",     {"x":1,"y":1},         404),
    ("note_del",   seed_note,    None,                               "DELETE", "/notes/{id}",              None,                  404),
    ("group",      seed_group,   "/spaces/{space_id}/groups",        "PATCH",  "/groups/{id}",             {"title":"x"},         404),
    ("recording",  seed_rec,     "/spaces/{space_id}/recordings",    "POST",   "/recordings/{id}/failed",  {"error":"x"},         403),
    ("rec_status", seed_rec,     None,                               "GET",    "/recordings/{id}/status",  None,                  404),
    ("key",        seed_key,     "/keys",                            "DELETE", "/keys/{id}",               None,                  404),
    ("subscription", seed_sub,   "/billing/subscription",            "POST",   "/billing/subscriptions/{id}/confirm", {"receipt":{}}, 403),
    ("transcript", seed_tx,      None,                               "POST",   "/functions/ai-extract",    {"transcriptId":"{id}","spaceId":"{space_id}"}, 403),
]

@pytest.mark.parametrize("case", OWNED_ENDPOINTS, ids=lambda c: c[0])
async def test_alice_cannot_touch_bobs_row(case, as_alice, bob, session): ...
```

Assertions per case:

1. **Read isolation** — `GET` on the collection as alice returns a list that
   does **not** contain bob's id. (This is the `USING` clause.)
2. **Write isolation** — the write returns the expected status **and** the row
   in the database is byte-identical to before. Re-read it with a raw
   `select()` and compare, do not trust the status code alone.
3. **Status parity** — 404 where RLS made the row invisible, 403 where an edge
   function did an explicit ownership check. The expected status is per-row in
   the table above because **the current behaviour is not uniform**; see
   [04 §D](04-authorization.md#d-the-hand-rolled-checks-in-edge-functions).

### B. `WITH CHECK` — you cannot create a row you do not own

| Test | Expectation |
|---|---|
| `POST /spaces/{bob_space}/notes` as alice | 404 (space invisible), and no note row created |
| `POST /spaces` with a body containing `user_id: bob.id` | 422 (`extra="forbid"`) or the field is ignored and the row is alice's — assert the created row's `user_id == alice.id` either way |
| `POST /spaces/{alice_space}/notes` with `parent_id` = one of bob's notes | Note is created with `parent_id = null`, or 404. Pick one, pin it |
| `POST /storage/recordings/presign-upload` with `space_id` = bob's | 404 |
| `POST /functions/ai-extract` with `spaceId` = bob's | 404 (this is a *tightening* of current behaviour — see [04 §D](04-authorization.md#d-the-hand-rolled-checks-in-edge-functions)) |
| `POST /functions/ai-extract` with `parentNoteId` = one of bob's notes, in alice's space | 404 `parent_note_not_found` — matches "a bad/foreign id can't attach notes to someone else's board" |

### C. Write-forbidden tables

Tables whose RLS was SELECT-only. Assert **no route exists** that writes them.

```python
READ_ONLY_TABLES = ["timeline_events", "credit_ledger", "credit_reservations",
                    "payments", "ai_models", "credit_packages", "subscription_plans"]

def test_no_write_route_touches_read_only_tables():
    # Walk app.routes; for each non-GET route, assert its handler module is not
    # a router that could write these. Belt-and-braces: also assert the schema
    # modules for these tables export no *Create/*Patch model reachable from a router.
```

Plus direct probes:

| Attempt | Expectation |
|---|---|
| `POST /spaces/{id}/timeline` | 405 or 404 — the route must not exist |
| Any request whose body contains `credits_balance` | 422 |
| Any request whose body contains `credits_reserved` | 422 |
| `PATCH /account/profile` with `{"credits_balance": 999999}` | 422, balance unchanged |

### D. The four guards

| Guard | Test |
|---|---|
| **1 — credit guard** (`t_guard_profile`) | `test_profile_patch_rejects_credit_fields`; plus the grep test asserting only `credits/repository.py` writes those columns |
| **2 — `encrypted_key` revoke** | `test_key_list_never_leaks_ciphertext`: assert `"encrypted_key" not in body`, `"\\x" not in body`, and the plaintext key string is absent from the raw response text. Also assert `KeyRepository.list_for_user` selects columns (inspect the compiled SQL: `assert "encrypted_key" not in str(stmt)`) |
| **3 — `grant_credits` revoke** | `test_grant_credits_has_exactly_one_caller` (grep); plus `test_double_confirm_grants_once` |
| **4 — `delete_own_account` grants** | `test_no_route_names_a_user_id`: `assert not any("{user_id}" in r.path for r in app.routes)`; plus `DELETE /account` as alice leaves bob's data intact |

### E. Storage path scoping

| Attempt | Expectation |
|---|---|
| `POST /storage/recordings/sign` with `key = "{bob.id}/s/r.m4a"` | 403 `forbidden`, and no presign is generated |
| Presign upload for alice's recording | key starts with `{alice.id}/` — assert the returned key, do not trust the request |
| A key with a traversal segment (`../`) | 403 |

### F. Token tests

| Test | Expectation |
|---|---|
| No `Authorization` header | 401 `{"error":"unauthorized","message":"missing Authorization header"}` |
| Garbage token | 401 `unauthorized` |
| Expired token | 401 |
| Token signed with the wrong secret | 401 |
| Token whose `sub` is a deleted user | 401 |
| Supabase-signed token, `SUPABASE_JWT_SECRET` **set** | 200 |
| Supabase-signed token, `SUPABASE_JWT_SECRET` **unset** | 401 |
| Alice's token used on bob's resources | the matrix in A |

---

## Per-module tests

### `test_auth.py`
Sign-up creates exactly: 1 user, 1 profile (`credits_balance=100`,
`free_refill_at=today`), 1 `credit_ledger` row (`+100`, `signup_grant`), 1 space
(`'My MindSpace'`, `'lightbulb'`). Duplicate email → 409. Wrong password → 401
`invalid_credentials`. Refresh rotates and revokes the old token; reusing a
revoked refresh token → 401. Reset-password returns 202 for an unknown email.
Delete-account cascades and leaves other users untouched.

### `test_credits.py`
- `reserve` beyond available → 402 `insufficient_credits`, balance untouched.
- **Concurrency**: `asyncio.gather` two `reserve(60)` against a balance of 100 in
  two separate sessions → exactly one succeeds. Run it 20×.
- `settle(res, 0, action)` → no ledger row, reservation `settled`, reserved freed.
- `settle(res, 7, action)` → one ledger row `delta=-7`, `balance_after` correct.
- `release` on an already-settled reservation → no-op, no exception.
- `monthly_free_refill` raises a 40-credit balance to 100 with a `delta=0` ledger
  row; leaves a 250-credit balance alone; leaves a balance already refilled this
  month alone.
- `sweep_stale_reservations` releases an expired `held` row and repairs a
  hand-corrupted `credits_reserved`.
- Ledger is append-only: assert `CreditLedgerRepository` has no `update`/`delete`.

### `test_notes.py`
Every `NoteRepository` method. Specifically:
- soft delete sets `deleted_at`, promotes children (`parent_id = null`), writes
  `note_deleted`, decrements `note_count` (never below 0);
- position update writes **no** timeline event;
- content update writes `note_updated`; type change writes `note_updated`;
  colour change writes **nothing** (the trigger checks only `content` and `type`);
- `move_many` with 30 moves issues one statement and ignores ids owned by someone else;
- `move_many([])` issues no statement.

### `test_ai_extraction.py` and `test_ai_layout.py`
**Port the cases from `apps/web/src/features/ai/schemas/extraction.test.ts` and
`apps/web/src/features/ai/services/layout.test.ts` one for one.** Those files are
the executable specification for `_shared/extraction.ts` and `_shared/layout.ts`
— their headers say so ("Mirrors src/features/ai/services/layout.ts, which
carries the unit tests"). Do not write new cases from scratch; translate.

Additional cases the TS suite may not cover:
- duplicate `clientKey` → relations touching it are dropped;
- `parentClientKey` pointing forward in the batch → resolves to `null`;
- `parentClientKey` == own `clientKey` → `null`;
- more than 8 notes → truncated to 8;
- fenced/prose-wrapped JSON → `extract_json_block` recovers the object;
- unbalanced braces → returns the tail rather than throwing.

### `test_byok_crypto.py`
The single most important test in this file:

```python
# Produced by supabase/functions/_shared/crypto.ts with a known master key.
DENO_BLOB_HEX = "…"          # iv(12) || ciphertext || tag
DENO_MASTER_KEY_B64 = "…"
DENO_PLAINTEXT = "sk-or-v1-…"

def test_decrypts_deno_produced_blob(monkeypatch):
    monkeypatch.setattr(settings, "byok_master_key", DENO_MASTER_KEY_B64)
    assert decrypt_api_key(bytes.fromhex(DENO_BLOB_HEX)) == DENO_PLAINTEXT
```

Generate the fixture once with `deno run` against `_shared/crypto.ts` and commit
the hex. Also: round-trip, wrong-key → `InvalidTag`, non-32-byte master key →
`RuntimeError`, `key_hint` uses U+2026 and the last four characters.

### `test_byok_resolver.py`
User key wins over platform key (`uses_platform_key is False`); no user key +
`byok_only` → 400 `byok_required`; no user key + no platform env → 500
`no_platform_key`; unknown provider → 500 `unsupported_provider`;
`base_url` on the user key overrides `PROVIDER_BASE_URL`.

Also `resolve_model`: preference honoured when enabled and of the right kind;
disabled preference falls through; **chat** falls to a provider the user holds a
key for; **transcribe deliberately does not**; final fallback is `is_default`;
no default → 500 `no_model_available`.

### `test_recordings.py`
The transcription flow with a stubbed provider, covering all the acceptance
criteria in [09 Phase 6](09-phases.md#phase-6--recordings-transcription-sse),
plus SSE: connect, receive the seed frame, trigger a status change, receive it,
receive a close on `completed`.

### `test_billing.py`
Double-confirm idempotency; amount mismatch → 402; unverified → 402 with
`reason`; unconfigured provider → 501 with `channel` and `missing`;
`total_credits == 0` → no ledger row; free-plan branch writes no `payments` row;
`ALLOW_TEST_PAY` unset → `test_pay_disabled`.

### `compat/test_functions_router.py`
For each of the eight (method, name) pairs: the compat endpoint and its RESTful
twin return **identical bodies** for the same input, and an unknown name returns
404 `unknown_function`.

---

## Architecture test (`test_architecture.py`)

Mirrors `apps/*/src/core/architecture.test.ts` on the Python side.

```python
# `app.core.*` is always allowed and is NOT listed here — _imported_modules()
# only yields `app.modules.X` names.  That matters: User/Profile/RefreshToken/
# PasswordResetToken live in app/core/models.py precisely so `credits` can write
# `profiles` without importing `auth`.  See docs 02, "The profiles table is
# shared between auth and credits".
ALLOWED: dict[str, set[str]] = {
    "ai":         {"credits", "byok", "notes", "spaces", "recordings", "timeline"},
    "recordings": {"credits", "byok", "storage", "ai", "spaces"},
    "billing":    {"credits"},
    "notes":      {"spaces", "timeline"},
    "auth":       {"spaces", "credits"},
    "spaces": set(), "credits": set(), "byok": set(), "timeline": set(), "storage": set(),
}

def test_module_dependencies():
    for module in ALLOWED:
        for py in Path(f"app/modules/{module}").rglob("*.py"):
            for imported in _imported_modules(py.read_text()):   # app.modules.X only
                assert imported in ALLOWED[module] | {module}, (module, imported, py)

def test_no_module_imports_another_modules_repository_or_models():
    # `from app.modules.notes.repository import …` outside app/modules/notes/ is a failure.
    # app.core.models is exempt by construction — it is not under app/modules/.
    ...

def test_core_models_holds_only_the_shared_identity_tables():
    # Guards against app/core/models.py becoming a dumping ground that erases
    # every module boundary.  Exactly four classes, no more.
    src = Path("app/core/models.py").read_text()
    classes = set(re.findall(r"^class (\w+)\(", src, re.M))
    assert classes == {"User", "Profile", "RefreshToken", "PasswordResetToken"}

def test_core_imports_no_module():
    for py in Path("app/core").rglob("*.py"):
        assert "app.modules" not in py.read_text(), py

def test_routers_do_not_import_repositories():
    for py in Path("app/modules").rglob("router.py"):
        assert "repository import" not in py.read_text()
```

## CI

```yaml
# .github/workflows/api.yml — sketch
services:
  postgres: {image: postgres:16-alpine, env: {...}, options: --health-cmd pg_isready}
  minio:    {image: minio/minio, ...}
steps:
  - uv sync --frozen
  - ruff check app tests seeds && ruff format --check app tests seeds
  - alembic upgrade head
  - alembic check                       # fails if models drift from the baseline
  - pytest -q --cov=app --cov-report=term-missing
```

**Coverage floors, enforced:** `app/modules/credits/` ≥ 95 %,
`app/modules/byok/` ≥ 95 %, `app/modules/auth/` ≥ 90 %, everything else ≥ 80 %.
Money and keys are where a gap costs the most.

Keep the existing frontend suites running too (`npm test` at the repo root runs
both workspaces) — `architecture.test.ts`, `extraction.test.ts`,
`layout.test.ts`, `upload.test.ts`, `coords.test.ts`, `graph.test.ts`,
`day.test.ts`, `color.test.ts`, `fonts.test.ts`, `gestureOrder.test.ts` must all
stay green through the cutover.
