# 07 — Docker, compose, and the one command

## The one command

```bash
make dev
```

which is:

```make
dev:
	@test -f .env || cp .env.example .env
	docker compose up --build
```

`docker compose up` alone works too — `make dev` only adds the `.env` bootstrap.

### What it does, step by step

| # | Service | Waits for | Does |
|---|---|---|---|
| 1 | `postgres` | — | Starts PostgreSQL 16. Healthcheck `pg_isready -U mindspace -d mindspace` |
| 2 | `minio` | — | Starts MinIO. Healthcheck `mc ready local` / `curl -f http://localhost:9000/minio/health/live` |
| 3 | `migrate` | `postgres: service_healthy`, `minio: service_healthy` | `alembic upgrade head`, then creates the private `recordings` bucket if absent. Exits 0. `restart: "no"` |
| 4 | `seed` | `migrate: service_completed_successfully` | `python -m seeds.seed` — idempotent upserts of 4 credit packages, 6 subscription plans, 20 ai_models rows (5 openrouter chat + 5 openrouter transcribe + 7 BYOK chat + 3 BYOK transcribe). Exits 0 |
| 5 | `api` | `seed: service_completed_successfully` | `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1 --reload`. Healthcheck `GET /health` |
| 6 | `web` | `api: service_healthy` | `next dev -p 3000` |

Total: `http://localhost:3000` (web), `http://localhost:8000/docs` (OpenAPI),
`http://localhost:9001` (MinIO console).

The mobile app is **not** in compose — Expo runs on the host
(`npm run mobile`), pointed at `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000`.
Putting Metro in a container buys nothing and breaks device connectivity.

---

## `docker-compose.yml` (repo root)

```yaml
name: mindspace

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-mindspace}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-mindspace}
      POSTGRES_DB: ${POSTGRES_DB:-mindspace}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-mindspace} -d ${POSTGRES_DB:-mindspace}"]
      interval: 3s
      timeout: 3s
      retries: 20

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-minioadmin}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-minioadmin}
    ports:
      - "${MINIO_PORT:-9000}:9000"
      - "${MINIO_CONSOLE_PORT:-9001}:9001"
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9000/minio/health/live || exit 1"]
      interval: 3s
      timeout: 3s
      retries: 20

  migrate:
    build:
      context: ./services/api
    env_file: [.env]
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-mindspace}:${POSTGRES_PASSWORD:-mindspace}@postgres:5432/${POSTGRES_DB:-mindspace}
      S3_ENDPOINT_URL: http://minio:9000
    command: ["sh", "-c", "alembic upgrade head && python -m seeds.bucket"]
    depends_on:
      postgres: {condition: service_healthy}
      minio:    {condition: service_healthy}
    restart: "no"

  seed:
    build:
      context: ./services/api
    env_file: [.env]
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-mindspace}:${POSTGRES_PASSWORD:-mindspace}@postgres:5432/${POSTGRES_DB:-mindspace}
    command: ["python", "-m", "seeds.seed"]
    depends_on:
      migrate: {condition: service_completed_successfully}
    restart: "no"

  api:
    build:
      context: ./services/api
    env_file: [.env]
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-mindspace}:${POSTGRES_PASSWORD:-mindspace}@postgres:5432/${POSTGRES_DB:-mindspace}
      S3_ENDPOINT_URL: http://minio:9000
      S3_PUBLIC_ENDPOINT_URL: http://localhost:9000     # presigned URLs the browser/phone must reach
      RUN_SCHEDULER: "true"
    ports:
      - "${API_PORT:-8000}:8000"
    volumes:
      - ./services/api:/app          # dev hot reload; drop this line for prod
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--reload"]
    depends_on:
      seed: {condition: service_completed_successfully}
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)\""]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 10s

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: dev
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL:-http://localhost:8000}
      WATCHPACK_POLLING: "true"
    ports:
      - "${WEB_PORT:-3000}:3000"
    volumes:
      - ./apps/web:/repo/apps/web
      - /repo/apps/web/node_modules
      - /repo/apps/web/.next
    depends_on:
      api: {condition: service_healthy}

volumes:
  pgdata:
  miniodata:
```

### `S3_PUBLIC_ENDPOINT_URL` — the presign gotcha

The API talks to MinIO at `http://minio:9000` (container network), but the
presigned URL it hands back is used by a **browser or a phone**, which cannot
resolve `minio`. Configure aioboto3 with `endpoint_url=S3_ENDPOINT_URL` for
API-side operations and generate presigned URLs against
`S3_PUBLIC_ENDPOINT_URL`. The simplest correct approach: build a second
client bound to the public endpoint and use it **only** for
`generate_presigned_url`. Signature validity is unaffected because SigV4 signs
the host header, and both clients sign against the host each will actually be
reached at.

For a phone on the LAN, `S3_PUBLIC_ENDPOINT_URL` must also be the LAN IP —
`http://192.168.x.y:9000`. Same rule as `EXPO_PUBLIC_API_URL`.

---

## `services/api/Dockerfile`

```dockerfile
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq5 curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app

# Dependency layer — cached unless the lockfile changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Source layer.
COPY alembic.ini ./
COPY alembic ./alembic
COPY seeds ./seeds
COPY app ./app
RUN uv sync --frozen --no-dev

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

A `dev` target adding `uv sync --frozen` (with dev deps) exists for local use;
compose's `--reload` plus the bind mount means the base image is enough in
practice.

**Do not run as root in production.** Add before `EXPOSE`:
```dockerfile
RUN useradd -m -u 10001 app && chown -R app:app /app
USER app
```

## `apps/web/Dockerfile`

Build context is the **repo root** because the monorepo uses npm workspaces and
`package-lock.json` lives at the top.

```dockerfile
# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci --workspace=@mindspace/web --include-workspace-root

# ---------- dev ----------
FROM node:22-alpine AS dev
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build ----------
FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build --workspace=@mindspace/web

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /repo/apps/web
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/apps/web/package.json ./
COPY --from=build /repo/node_modules /repo/node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
```

`NEXT_PUBLIC_*` is inlined at **build** time, so the production image is baked
against one API URL. In dev the `dev` target reads it at runtime, which is why
compose uses `target: dev`.

Add `apps/web/.dockerignore` and a root `.dockerignore` containing at least:
`node_modules`, `.next`, `.git`, `*.png`, `apps/mobile/.expo`.

---

## `.env.example` (replaces the current 14-line file)

```dotenv
# ==============================================================================
# MindSpace — one .env for the whole stack.  `make dev` copies this to .env.
# ==============================================================================

# ---- Postgres ----------------------------------------------------------------
POSTGRES_USER=mindspace
POSTGRES_PASSWORD=mindspace
POSTGRES_DB=mindspace
POSTGRES_PORT=5432
# Consumed by api/migrate/seed; compose composes this from the three above.
DATABASE_URL=postgresql+asyncpg://mindspace:mindspace@postgres:5432/mindspace

# ---- API ---------------------------------------------------------------------
API_PORT=8000
API_ENV=development                      # development | production
API_LOG_LEVEL=info
# 32+ random bytes.  openssl rand -base64 48
API_JWT_SECRET=change-me-openssl-rand-base64-48
API_JWT_ISSUER=mindspace-api
API_ACCESS_TOKEN_TTL_SECONDS=3600        # matches supabase config.toml jwt_expiry
API_REFRESH_TOKEN_TTL_DAYS=30
API_CORS_ORIGINS=http://localhost:3000,http://192.168.1.10:3000
RUN_SCHEDULER=true                       # exactly ONE replica may set this

# ---- Cutover only: accept Supabase-issued JWTs too (see docs 04 §A) -----------
# Unset once every client is on FastAPI-issued tokens.
SUPABASE_JWT_SECRET=

# ---- Object storage (MinIO) --------------------------------------------------
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_PORT=9000
MINIO_CONSOLE_PORT=9001
S3_BUCKET=recordings
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT_URL=http://minio:9000              # API -> MinIO, container network
S3_PUBLIC_ENDPOINT_URL=http://localhost:9000   # browser/phone -> MinIO.  LAN IP for a device.
S3_MAX_UPLOAD_BYTES=26214400                   # 25 MiB, from 0013_storage.sql
S3_PRESIGN_TTL_SECONDS=600

# ---- BYOK encryption ---------------------------------------------------------
# EXACTLY 32 bytes, base64.  openssl rand -base64 32
# Carry the existing value over verbatim — the ciphertext format is unchanged.
BYOK_MASTER_KEY=

# ---- Platform AI provider keys ------------------------------------------------
# Looked up as PLATFORM_{PROVIDER}_KEY by resolve_api_key().
PLATFORM_OPENROUTER_KEY=
PLATFORM_OPENAI_KEY=
PLATFORM_GOOGLE_KEY=
PLATFORM_ANTHROPIC_KEY=
PLATFORM_NVIDIA_KEY=

# ---- Payments -----------------------------------------------------------------
ALLOW_TEST_PAY=true                      # sandbox channel; NEVER true in production
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=
GOOGLE_PLAY_PACKAGE_NAME=
APPLE_IAP_ISSUER_ID=
APPLE_IAP_KEY_ID=
APPLE_IAP_PRIVATE_KEY=
APPLE_IAP_BUNDLE_ID=
INSTAPAY_GATEWAY_API_KEY=
INSTAPAY_MERCHANT_ID=

# ---- Email (password reset) ---------------------------------------------------
# See docs/fastapi-migration/11-risks-open-questions.md §Q2 — unresolved.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=no-reply@mindspace.app
PASSWORD_RESET_URL=mindspace://reset-password     # deep link, matches app.json scheme

# ---- Web ----------------------------------------------------------------------
WEB_PORT=3000
NEXT_PUBLIC_API_URL=http://localhost:8000

# ---- Mobile (host-run Expo, not in compose) -----------------------------------
# MUST be a LAN IP — a phone cannot reach localhost.  `make lan-ip` prints one.
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
```

### Env var table

| Var | Service | Required | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | api, migrate, seed | ✅ | — | `postgresql+asyncpg://…` |
| `API_JWT_SECRET` | api | ✅ | — | HS256 signing secret. Rotating it invalidates every session |
| `API_JWT_ISSUER` | api | | `mindspace-api` | `iss` claim |
| `API_ACCESS_TOKEN_TTL_SECONDS` | api | | `3600` | Matches `config.toml` `jwt_expiry` |
| `API_REFRESH_TOKEN_TTL_DAYS` | api | | `30` | |
| `API_CORS_ORIGINS` | api | | `http://localhost:3000` | Comma-separated. Mobile needs no CORS |
| `RUN_SCHEDULER` | api | | `false` | APScheduler on/off. One replica only |
| `SUPABASE_JWT_SECRET` | api | | *(unset)* | Cutover only. Unset ⇒ Supabase tokens rejected |
| `S3_*` | api, migrate | ✅ | see above | `S3_PUBLIC_ENDPOINT_URL` ≠ `S3_ENDPOINT_URL` on purpose |
| `BYOK_MASTER_KEY` | api | ✅ | — | base64, exactly 32 bytes. **Carry over from Supabase secrets verbatim** |
| `PLATFORM_OPENROUTER_KEY` | api | ✅ in practice | — | Every transcription runs on it (`0027`) |
| `PLATFORM_{OPENAI,GOOGLE,ANTHROPIC,NVIDIA}_KEY` | api | | — | Absent ⇒ 500 `no_platform_key` for those providers, which is correct today |
| `ALLOW_TEST_PAY` | api | | `false` | `'true'` enables the sandbox channel |
| `GOOGLE_PLAY_*`, `APPLE_IAP_*`, `INSTAPAY_*` | api | | — | Absent ⇒ 501 `provider_not_configured` |
| `SMTP_*`, `PASSWORD_RESET_URL` | api | | — | Unresolved — see [11 §Q2](11-risks-open-questions.md#q2) |
| `NEXT_PUBLIC_API_URL` | web | ✅ | `http://localhost:8000` | Inlined at build time in prod |
| `EXPO_PUBLIC_API_URL` | mobile (host) | ✅ | — | LAN IP |
| `POSTGRES_*`, `MINIO_*`, `*_PORT` | infra | | see above | |

---

## `Makefile` (repo root)

```make
.DEFAULT_GOAL := help
COMPOSE := docker compose

help:                ## Show this help
	@grep -hE '^[a-z-]+:.*?##' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  %-14s %s\n", $$1, $$2}'

dev:                 ## Bring up the whole stack (postgres + minio + migrate + seed + api + web)
	@test -f .env || cp .env.example .env
	$(COMPOSE) up --build

down:                ## Stop everything, keep volumes
	$(COMPOSE) down

clean:               ## Stop everything and DESTROY the database and object store
	$(COMPOSE) down -v

logs:                ## Tail api logs
	$(COMPOSE) logs -f api

sh:                  ## Shell into the api container
	$(COMPOSE) exec api sh

psql:                ## psql into the database
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-mindspace} -d $${POSTGRES_DB:-mindspace}

migrate:             ## Apply migrations against the running database
	$(COMPOSE) run --rm migrate

revision:            ## Create an Alembic revision:  make revision m="add x"
	$(COMPOSE) run --rm api alembic revision --autogenerate -m "$(m)"

seed:                ## Re-run the idempotent seed
	$(COMPOSE) run --rm seed

test:                ## Run the API test suite
	$(COMPOSE) run --rm api pytest -q

test-web:            ## Run the web + mobile jest suites on the host
	npm test

lint:                ## ruff check + format --check
	$(COMPOSE) run --rm api sh -c "ruff check app tests seeds && ruff format --check app tests seeds"

mobile:              ## Start Expo on the host (not containerised)
	npm run mobile

lan-ip:              ## Print the LAN IP to put in EXPO_PUBLIC_API_URL
	@ip route get 1.1.1.1 2>/dev/null | awk '{print $$7; exit}' || ipconfig getifaddr en0
```

## Production differences (not part of `make dev`)

- `web` uses `target: runtime`, no bind mounts, `NEXT_PUBLIC_API_URL` as a build arg.
- `api` drops `--reload` and the bind mount; `USER app`.
- MinIO is replaced by real S3 (or MinIO with TLS behind the reverse proxy);
  only `S3_ENDPOINT_URL` / `S3_PUBLIC_ENDPOINT_URL` / credentials change.
- A reverse proxy (Caddy/nginx) terminates TLS. **Set its proxy read timeout
  above 60 s** or the `provider_timeout` path never gets to return its 504.
- `ALLOW_TEST_PAY` must be unset.
- Still `--workers 1` until the SSE broker moves to `LISTEN/NOTIFY`
  ([01 §2.8](01-current-surface.md#28-realtime-0018_realtime_recordingssql--sse)).
