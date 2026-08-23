# 08 — Data migration runbook

Assumes a live Supabase project with real users. If you are migrating an empty
project, run steps 1–2 and skip to verification.

**Total downtime target:** one maintenance window, ~15 minutes for a small
dataset. The strangler option ([09](09-phases.md#strangler-fig-option)) reduces
it to zero at the cost of a dual-write period.

---

## 0. Before you start

```bash
# Record the exact source state.  Everything below is reproducible from these.
supabase db dump --db-url "$SUPABASE_DB_URL" --file backup_full_$(date +%F).sql
psql "$SUPABASE_DB_URL" -c "select count(*) from auth.users"
psql "$SUPABASE_DB_URL" -c "select count(*) from public.sticky_notes"
psql "$SUPABASE_DB_URL" -c "select sum(credits_balance) from public.profiles"
```

Write those three numbers down. They are the verification targets in step 6.

**Collect these secrets from the Supabase dashboard** — you cannot recover them
later:

| Secret | Where | Used for |
|---|---|---|
| `BYOK_MASTER_KEY` | Edge Function secrets | Decrypting `user_ai_keys.encrypted_key`. **Without it every BYOK key is lost** |
| JWT secret | Settings → API → JWT Settings | `SUPABASE_JWT_SECRET` for the compat window |
| `PLATFORM_*_KEY` | Edge Function secrets | Continues to work unchanged |
| Storage bucket contents | — | Step 5 |

---

## 1. Stand up the target schema

```bash
cp .env.example .env
# fill in BYOK_MASTER_KEY (verbatim from Supabase), API_JWT_SECRET (new), SUPABASE_JWT_SECRET
docker compose up -d postgres minio
docker compose run --rm migrate      # alembic upgrade head + create the bucket
```

**Do not run `seed` yet.** The dump carries `ai_models`, `subscription_plans`
and `credit_packages` rows with their existing UUIDs, and `profiles.chat_model_id`
FKs point at those UUIDs. Seeding first would create duplicate catalogue rows
with new IDs.

## 2. Dump the source data

Data only, in FK-safe order, from the `public` schema:

```bash
export SRC="$SUPABASE_DB_URL"
mkdir -p dump

# Catalogue first (nothing references anything else).
for t in ai_models credit_packages subscription_plans; do
  psql "$SRC" -c "\copy (select * from public.$t) to 'dump/$t.csv' with (format csv, header)"
done

# Users (see step 3 for the transform).
psql "$SRC" -c "\copy (
  select id, email, encrypted_password, email_confirmed_at,
         coalesce(is_anonymous,false) as is_anonymous,
         coalesce(raw_user_meta_data,'{}'::jsonb) as raw_user_meta_data,
         created_at, updated_at, last_sign_in_at
  from auth.users
) to 'dump/users.csv' with (format csv, header)"

# Everything owned, in dependency order.
for t in profiles spaces recordings transcripts sticky_notes relationships \
         note_groups ai_actions ai_action_items timeline_events \
         user_ai_keys credit_ledger credit_reservations \
         subscriptions payments; do
  psql "$SRC" -c "\copy (select * from public.$t) to 'dump/$t.csv' with (format csv, header)"
done
```

`user_ai_keys.encrypted_key` is `bytea`; CSV renders it as `\x…` hex. Load it
back with the same representation — Postgres parses `\x` hex on input when
`bytea_output`/input is the default `hex`. Verify with step 6's query rather
than assuming.

## 3. Transform `auth.users` {#3-transform-authusers}

The only structural transform in the whole migration. Everything else is a
straight copy.

| Source column | Target column | Transform |
|---|---|---|
| `auth.users.id` | `users.id` | **verbatim — never regenerate** |
| `auth.users.email` | `users.email` | verbatim |
| `auth.users.encrypted_password` | `users.encrypted_password` | verbatim, *if* it is bcrypt — see below |
| `auth.users.email_confirmed_at` | `users.email_confirmed_at` | verbatim |
| `auth.users.is_anonymous` | `users.is_anonymous` | `coalesce(…, false)` |
| `auth.users.raw_user_meta_data` | `users.raw_user_meta_data` | `coalesce(…, '{}')` — carries `full_name` |
| `auth.users.created_at` / `updated_at` / `last_sign_in_at` | same | verbatim |
| everything else in `auth.users` | — | dropped (GoTrue internals: `confirmation_token`, `recovery_token`, `aud`, `role`, `phone`, MFA columns, …) |

### Verify the password hash format BEFORE committing to bcrypt

**Do not assume.** Run:

```sql
select left(encrypted_password, 7) as prefix, count(*)
from auth.users
where encrypted_password is not null
group by 1;
```

| Prefix | Meaning | Action |
|---|---|---|
| `$2a$NN$` / `$2b$NN$` / `$2y$NN$` | bcrypt, cost `NN` | Copy verbatim. Use the `bcrypt` package; set `gensalt(rounds=NN)` for **new** hashes so cost stays consistent |
| `$argon2…` | Argon2 | Use `argon2-cffi` instead; the column copies verbatim either way |
| anything else | Unknown/scrypt | **Stop.** Passwords cannot be carried over |

If the hashes are not portable, the fallback is a **forced password reset for
all users**: null out `encrypted_password`, and have `POST /auth/sign-in` return
`{"error": "password_reset_required"}` for those accounts, with the client
routing to the reset flow. That is a **product decision** — surface it to a human
before proceeding, do not decide it in code.

Rows with `encrypted_password IS NULL` (anonymous accounts from before
`0016_email_auth_notes.sql`) migrate fine; they simply cannot sign in with a
password, which is already true today.

## 4. Load

```bash
export DST="postgresql://mindspace:mindspace@localhost:5432/mindspace"

psql "$DST" -c "\copy public.ai_models          from 'dump/ai_models.csv'          with (format csv, header)"
psql "$DST" -c "\copy public.credit_packages    from 'dump/credit_packages.csv'    with (format csv, header)"
psql "$DST" -c "\copy public.subscription_plans from 'dump/subscription_plans.csv' with (format csv, header)"
psql "$DST" -c "\copy public.users              from 'dump/users.csv'              with (format csv, header)"

for t in profiles spaces recordings transcripts sticky_notes relationships \
         note_groups ai_actions ai_action_items timeline_events \
         user_ai_keys credit_ledger credit_reservations subscriptions payments; do
  psql "$DST" -c "\copy public.$t from 'dump/$t.csv' with (format csv, header)"
done

# credit_ledger.id is an identity/serial — advance it past the loaded max.
psql "$DST" -c "select setval(pg_get_serial_sequence('credit_ledger','id'),
                              coalesce((select max(id) from credit_ledger), 1))"
```

**Generated columns:** `credit_packages.total_credits` and
`subscription_plans.total_credits` are `GENERATED ALWAYS … STORED` and
**cannot be inserted into**. Either exclude them from the `\copy` column list on
both dump and load, or dump those two tables with an explicit column list. The
loop above must special-case them:

```bash
psql "$SRC" -c "\copy (select id,name,price_egp,base_credits,bonus_pct,is_featured,
                              store_product_id_ios,store_product_id_android,enabled,sort_order
                       from public.credit_packages) to 'dump/credit_packages.csv' with (format csv, header)"
psql "$DST" -c "\copy public.credit_packages(id,name,price_egp,base_credits,bonus_pct,is_featured,
                              store_product_id_ios,store_product_id_android,enabled,sort_order)
                from 'dump/credit_packages.csv' with (format csv, header)"
```

Same treatment for `subscription_plans`.

**Then, and only then**, run the seed to add anything the source project was
missing:

```bash
docker compose run --rm seed     # idempotent upserts, ON CONFLICT DO NOTHING / DO UPDATE
```

## 5. BYOK keys — **no re-encryption is needed**

The task's runbook item presumes re-encryption work. It is **not required**, and
here is the evidence:

`supabase/functions/_shared/crypto.ts` does AES-256-GCM with a 12-byte random
IV, and stores `iv ‖ ciphertext‖tag` as one self-contained blob; the master key
is 32 bytes, base64-decoded from `BYOK_MASTER_KEY`. Python's
`cryptography.hazmat.primitives.ciphers.aead.AESGCM` produces and consumes
**exactly that layout** (WebCrypto appends the 16-byte tag to the ciphertext;
so does `AESGCM.encrypt`).

```python
# app/modules/byok/crypto.py — byte-compatible with _shared/crypto.ts
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

IV_BYTES = 12

def _master_key() -> bytes:
    raw = settings.byok_master_key
    if not raw:
        raise RuntimeError("BYOK_MASTER_KEY is not set")
    key = base64.b64decode(raw)
    if len(key) != 32:
        raise RuntimeError("BYOK_MASTER_KEY must be 32 bytes (base64)")
    return key

def encrypt_api_key(plaintext: str) -> bytes:
    iv = os.urandom(IV_BYTES)
    return iv + AESGCM(_master_key()).encrypt(iv, plaintext.encode(), None)

def decrypt_api_key(blob: bytes) -> str:
    return AESGCM(_master_key()).decrypt(blob[:IV_BYTES], blob[IV_BYTES:], None).decode()

def key_hint(plaintext: str) -> str:
    return f"…{plaintext[-4:]}"          # U+2026, matching the TS
```

**So: carry `BYOK_MASTER_KEY` over verbatim and copy the `bytea` column.** Done.

Write `tests/modules/test_byok_crypto.py` with a blob produced by the *Deno*
implementation, hard-coded as a hex literal, and assert `decrypt_api_key` returns
the known plaintext. That is the only proof that matters.

**Re-encryption is the key-rotation path, not the migration path.** If you ever
need it (master key compromised, or moving to a KMS):

```python
async def rotate(session, old_key: bytes, new_key: bytes) -> int:
    rows = (await session.scalars(select(UserAiKey))).all()
    for row in rows:
        plain = AESGCM(old_key).decrypt(row.encrypted_key[:12], row.encrypted_key[12:], None)
        iv = os.urandom(12)
        row.encrypted_key = iv + AESGCM(new_key).encrypt(iv, plain, None)
    await session.commit()
    return len(rows)
```
Run it with **both** keys present, in a transaction, having taken a dump first.

## 6. Storage objects

```bash
# 1. Pull every object from Supabase Storage, preserving the {uid}/{sid}/{rid}.{ext} layout.
#    Use the Supabase CLI, or the S3-compatible endpoint if enabled on the project.
mkdir -p recordings-dump
# e.g. with the storage API + a service-role key:
#   for each row in `select storage_path from recordings where storage_path is not null`
#   GET  $SUPABASE_URL/storage/v1/object/recordings/$path  ->  recordings-dump/$path

# 2. Push into MinIO with identical keys.
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing local/recordings
mc anonymous set none local/recordings          # private, matching `public = false`
mc mirror recordings-dump/ local/recordings/
```

Nothing in `recordings.storage_path` needs rewriting — the key layout is
identical (`{userId}/{spaceId}/{recordingId}.{ext}` from
`audioFormat.ts::buildStoragePath`).

Reconciliation query — every referenced object must exist:

```sql
select id, storage_path from recordings where storage_path is not null order by created_at desc;
```
Diff that list against `mc ls --recursive local/recordings`. Any row whose object
is missing should have `storage_path` nulled and `local_only` set true — that is
exactly the state a free-plan user is already in, so it degrades gracefully.

## 7. Verification queries

Run **all** of these against the target. Every one must pass before cutting
traffic over.

```sql
-- 1. Row counts match the source, table for table.
select 'users' t, count(*) from users
union all select 'profiles',            count(*) from profiles
union all select 'spaces',              count(*) from spaces
union all select 'sticky_notes',        count(*) from sticky_notes
union all select 'relationships',       count(*) from relationships
union all select 'note_groups',         count(*) from note_groups
union all select 'recordings',          count(*) from recordings
union all select 'transcripts',         count(*) from transcripts
union all select 'ai_actions',          count(*) from ai_actions
union all select 'ai_action_items',     count(*) from ai_action_items
union all select 'timeline_events',     count(*) from timeline_events
union all select 'user_ai_keys',        count(*) from user_ai_keys
union all select 'credit_ledger',       count(*) from credit_ledger
union all select 'credit_reservations', count(*) from credit_reservations
union all select 'subscriptions',       count(*) from subscriptions
union all select 'payments',            count(*) from payments
order by 1;

-- 2. Every profile has a user, and vice versa.  Must return 0 rows.
select p.id from profiles p left join users u on u.id = p.id where u.id is null;
select u.id from users u left join profiles p on p.id = u.id where p.id is null;

-- 3. No orphaned ownership.  Must return 0 for every table.
select count(*) from spaces       s left join users u on u.id = s.user_id where u.id is null;
select count(*) from sticky_notes n left join users u on u.id = n.user_id where u.id is null;
select count(*) from recordings   r left join users u on u.id = r.user_id where u.id is null;
select count(*) from user_ai_keys k left join users u on u.id = k.user_id where u.id is null;

-- 4. Credit balances: exact source↔target diff.
--    Do NOT try to reconstruct the balance from the ledger — monthly_free_refill()
--    raises credits_balance to 100 while writing a delta-0 row, so
--    `sum(delta) = credits_balance` is genuinely false for any refilled user and
--    makes a useless gate.  What actually matters is that the copy is faithful,
--    so diff the two databases directly.
--
--    Run against BOTH, redirect to files, and `diff` them.  Any output is a failure.
select id, credits_balance, credits_reserved from profiles order by id;

-- 5. Total credits in the system matches the number recorded in step 0.
select sum(credits_balance) as balance, sum(credits_reserved) as reserved from profiles;

-- 6. Reserved credits agree with held reservations (the hourly cron's invariant).
select p.id, p.credits_reserved,
       coalesce((select sum(amount) from credit_reservations r
                 where r.user_id = p.id and r.status = 'held'), 0) as held
from profiles p
where p.credits_reserved <> coalesce((select sum(amount) from credit_reservations r
                                      where r.user_id = p.id and r.status = 'held'), 0);

-- 7. Payment idempotency key survived.
select channel, external_ref, count(*) from payments group by 1,2 having count(*) > 1;

-- 8. Every note's parent, if set, is a real note.
select n.id from sticky_notes n
left join sticky_notes p on p.id = n.parent_id
where n.parent_id is not null and p.id is null;

-- 9. Catalogue integrity: preference FKs resolve.
select id, chat_model_id from profiles p
where chat_model_id is not null
  and not exists (select 1 from ai_models m where m.id = p.chat_model_id);

-- 10. Enum labels all landed (a truncated enum silently becomes an error on read).
select unnest(enum_range(null::recording_status));   -- expect 7 labels
select unnest(enum_range(null::note_type));          -- expect 7
select unnest(enum_range(null::ai_action_status));   -- expect 7
```

Query 4 concretely — this is the credit gate, run it exactly like this:

```bash
Q="select id, credits_balance, credits_reserved from profiles order by id"
psql "$SRC" -At -F, -c "$Q" > /tmp/credits_src.csv
psql "$DST" -At -F, -c "$Q" > /tmp/credits_dst.csv
diff /tmp/credits_src.csv /tmp/credits_dst.csv && echo "CREDITS OK"
```

Any diff output is a failed load. Do the same for `sticky_notes`
(`select id, space_id, left(content,40) from sticky_notes order by id`) if you
want a second, cheap spot check on the largest table.

### BYOK verification — the one that proves the crypto

```bash
docker compose exec api python - <<'PY'
import asyncio
from sqlalchemy import select
from app.core.db import async_session_factory
from app.modules.byok.models import UserAiKey
from app.modules.byok.crypto import decrypt_api_key

async def main():
    async with async_session_factory() as s:
        rows = (await s.scalars(select(UserAiKey))).all()
        ok = bad = 0
        for r in rows:
            try:
                plain = decrypt_api_key(bytes(r.encrypted_key))
                assert plain[-4:] == r.key_hint[-4:], (r.id, r.key_hint)
                ok += 1
            except Exception as e:
                bad += 1
                print("FAILED", r.id, r.provider, e)
        print(f"decrypted {ok}/{ok+bad}")

asyncio.run(main())
PY
```

`ok == total` and `bad == 0` is the acceptance criterion. Any failure means the
master key is wrong — **stop and fix it before cutting over**, because a user's
key cannot be recovered from a hint.

### Smoke test against the running API

```bash
# Sign in as a migrated user with their existing password.
curl -sS -X POST localhost:8000/auth/sign-in \
  -H 'content-type: application/json' \
  -d '{"email":"known@user.test","password":"<their password>"}' | tee /tmp/tok.json

TOKEN=$(jq -r .access_token /tmp/tok.json)
curl -sS localhost:8000/spaces          -H "Authorization: Bearer $TOKEN" | jq 'length'
curl -sS localhost:8000/credits/balance -H "Authorization: Bearer $TOKEN"
curl -sS localhost:8000/keys            -H "Authorization: Bearer $TOKEN" | jq '.[].key_hint'
# And the compat-window check: a Supabase-issued token must also work.
curl -sS localhost:8000/spaces -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" | jq 'length'
```

---

## 8. Rollback

The migration is **copy-forward only** — nothing is deleted from Supabase — so
rollback is: point the clients back at Supabase.

| Point of failure | Rollback |
|---|---|
| Anywhere before the client cutover | Nothing to undo. `docker compose down -v` and start again |
| After client cutover, before any writes landed in the new DB | Revert the `container.ts` commit (web) / ship the previous mobile build. Supabase is untouched and still authoritative |
| After client cutover, with writes in the new DB | **This is the expensive case.** You need a reverse sync. Prevent it by: (a) putting Supabase in read-only mode during the window (`alter default privileges` / revoke write from `authenticated`), and (b) keeping the window short. If it happens anyway, dump the delta by `created_at > cutover_time` from the new DB and replay into Supabase — write that script *before* the window, not during |
| BYOK decryption fails | Do not cut over. `user_ai_keys` is the only table with a hard dependency on a secret |
| Storage objects missing | Non-blocking: null `storage_path`, set `local_only = true`. Users keep their device copies and their transcripts |

**Mobile is the real constraint.** Web can be reverted with a deploy; a shipped
mobile binary cannot. Two mitigations, pick one and write it down:

1. **Ship the mobile cutover behind a remote flag** read at startup
   (`features.ts` already exists as a config surface), so `container.ts` can
   choose the Supabase or API container at runtime. Reverting is a config
   change.
2. **Keep Supabase running and the compat JWT window open for a full release
   cycle**, so an old binary keeps working against Supabase while the new one
   talks to FastAPI. This is the strangler option in
   [09](09-phases.md#strangler-fig-option) and it is the recommended path when
   real users exist.
