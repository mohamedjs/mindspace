# MindSpace v2 Audit Resolution Status

Comprehensive verification of every finding in `docs/v2/AUDIT.md`, documenting the architectural resolution and the exact automated test in v2 proving each vulnerability and bottleneck is closed.

---

## 1. Critical Findings

### C1. Anyone can mint credits
- **Vulnerability:** `grant_credits` was executable by `authenticated` and `anon` roles via Postgres execution grants.
- **Resolution in v2:** Money logic has zero client-accessible HTTP routes. `grant` is an internal application use case requiring a caller transaction and called only by server-side billing confirmation and administrative workflows.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)
  - `rejects grant when executed outside a caller transaction`
  - `enforces that client HTTP surface does not expose money minting routes`

### C2. Unlimited free refills
- **Vulnerability:** `monthly_free_refill` was client-callable and `guard_profile_update` allowed users to clear their own `free_refill_at`.
- **Resolution in v2:** `monthlyFreeRefill` is executed exclusively by background worker maintenance sweeps under transactional locks. The HTTP profile endpoints reject updates to billing or refill columns.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)
  - `monthlyFreeRefill executes idempotently and records real delta`

---

## 2. High Findings

### H1. Unchecked `settle_credits` / `release_credits` & Mid-Request Race
- **Vulnerability:** No owner check on reservation release/settle allowed cross-user release or self-release to get free transcriptions.
- **Resolution in v2:** All credit operations require explicit `userId` parameter and use `SELECT ... FOR UPDATE` row-level locks. User B gets 404 attempting to release or settle User A's reservation.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)
  - `enforces strict user isolation: User B cannot release or settle User A's reservation (404)`

### H2. `ai-extract` Space Ownership Bypass
- **Vulnerability:** Caller could provide arbitrary `spaceId` without ownership check.
- **Resolution in v2:** `SpaceOwnershipChecker` validates that `space.userId === currentUserId`. Foreign space UUID returns 404.
- **Proving Test:** [`apps/api/src/modules/ai/ai.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/ai/ai.test.ts)
  - `POST /ai/extract returns 404 if space belongs to another user`

### H3. `transcribe` Unchecked Error Row Updates
- **Vulnerability:** `recordingId` set before owner check, catch block updated row with service role.
- **Resolution in v2:** Every recording status change (`markRecordingFailed`, `finish`, `uploadPart`) verifies `userId` ownership before database mutation.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts)
  - `POST /recordings/:id/failed returns 404 when caller does not own the recording`

### H4. Client-Supplied `duration_ms` Under-Billing
- **Vulnerability:** Billing relied on client-supplied `duration_ms`.
- **Resolution in v2:** Server probes the actual audio container duration using `ffmpegMediaAdapter` / ffprobe on disk before calculating credit reservations and charges.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts)
  - `charges based on probed server duration rather than client-supplied duration`

### H5. Client-Only Plan Limits
- **Vulnerability:** Plan limits were checked only in frontend UI. Free tier users could access AI through direct API calls.
- **Resolution in v2:** Server-side `EntitlementsPort` enforces `ai_enabled` and `max_recording_minutes` on recording creation, audio upload, and finish.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts) & [`apps/api/src/modules/billing/billing.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/billing/billing.test.ts)
  - `rejects processing with 403 ai_not_in_plan when user plan has ai_enabled=false`

### H6. Uncapped `actual` in Settle Exceeds Reservation
- **Vulnerability:** Actual credit charge exceeding reservation triggered check constraint failure after notes were inserted, producing duplicate notes on retry.
- **Resolution in v2:** Actual charges are strictly capped at held reservation (`Math.min(actual, held)`), and note generation and credit settlement share an atomic transaction.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)
  - `settle caps actual at reserved amount and shares transaction with work`

### H7. Non-Atomic Payment Confirmation
- **Vulnerability:** Payment record, credit grant, and subscription activation were separate writes.
- **Resolution in v2:** Subscription confirmation wraps payment insertion, plan activation, and credit grant inside a single atomic database transaction.
- **Proving Test:** [`apps/api/src/modules/billing/billing.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/billing/billing.test.ts)
  - `POST /billing/subscriptions/:id/confirm rolls back atomically if credit grant fails, leaving no orphaned active subscription`

---

## 3. Medium Findings

### M1. SSRF via Custom `baseUrl`
- **Vulnerability:** `byok-save` accepted user-supplied `baseUrl` which backend subsequently requested.
- **Resolution in v2:** Custom base URLs are completely rejected. Provider base URLs are fixed, immutable constants.
- **Proving Test:** [`apps/api/src/modules/byok/byok.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/byok/byok.test.ts)
  - `POST /keys rejects custom baseUrl and validates known provider endpoints`

### M2. Only OpenRouter Keys Validated
- **Vulnerability:** OpenAI, Anthropic, and Google keys saved without validation.
- **Resolution in v2:** `HttpKeyValidator` validates all supported providers (`openrouter`, `openai`, `anthropic`, `google`) via live authentication calls before saving.
- **Proving Test:** [`apps/api/src/modules/byok/byok.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/byok/byok.test.ts)
  - `validates keys for all supported providers (openai, anthropic, google, openrouter) before saving`

### M3. Duplicate Active Keys & Ignored Errors
- **Vulnerability:** `resolveApiKey` query errors silently fell back to platform keys.
- **Resolution in v2:** Partial unique index `ix_user_ai_keys_active_provider` prevents duplicate active keys. Errors in resolution abort processing instead of silently draining platform credits.
- **Proving Test:** [`apps/api/src/modules/byok/byok.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/byok/byok.test.ts)
  - `Saving Replaces Existing Key, Security & User Isolation, and resolveKey (M3)`

### M4. Refill Writing `delta = 0` to Ledger
- **Vulnerability:** Monthly refill ledger entries wrote `delta = 0`.
- **Resolution in v2:** `monthlyFreeRefill` calculates `delta = target - current` and records the exact positive delta.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)
  - `records non-zero delta equal to granted refill amount in credit_ledger`

### M5. Missing Enum Value `applied` in Note Writes
- **Vulnerability:** Enum lacked `applied` status.
- **Resolution in v2:** All statuses use typed domain entities and matched database enums.
- **Proving Test:** [`apps/api/src/modules/ai/ai.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/ai/ai.test.ts)
  - `records ai_actions with valid enum status and links created notes`

### M6. Ignored Results of Action Items & Relationships Inserts
- **Vulnerability:** Database inserts did not check or return inserted rows.
- **Resolution in v2:** Inserts return generated IDs and rows, validating persistence.
- **Proving Test:** [`apps/api/src/modules/ai/ai.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/ai/ai.test.ts)
  - `persists and returns all created action items and relationships`

### M7. Audio Bucket Drift from Migrations
- **Vulnerability:** Migrations did not allow standard container formats like webm and ogg.
- **Resolution in v2:** All audio containers (`webm`, `wav`, `ogg`, `mp3`, `m4a`) are allowed and validated via magic bytes.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts)
  - `accepts all supported audio containers (webm, wav, ogg, mp3, m4a) based on magic bytes`

### M8. Exception & Provider Leaks to Clients
- **Vulnerability:** Raw exception traces leaked to clients.
- **Resolution in v2:** Centralized `handleHttpError` enforces uniform error envelope `{"error": code, "message": text}`.
- **Proving Test:** [`apps/api/src/platform/http/errors.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/platform/http/errors.test.ts)
  - `sanitizes unhandled internal errors to { error: "internal_error", message: "Internal server error" }`

### M9. Unbounded Function Proxy
- **Vulnerability:** Wildcard route forwarded arbitrary function names.
- **Resolution in v2:** Dynamic function proxy removed. Fastify uses explicit, statically declared routes.
- **Proving Test:** [`apps/api/src/platform/http/server.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/platform/http/server.test.ts)
  - `returns the error envelope for unknown routes`

### M10. Browser-Orchestrated Pipeline
- **Vulnerability:** Browser closing stranded in-flight recordings.
- **Resolution in v2:** Server orchestrates pipeline via `recordings` queue with `FOR UPDATE SKIP LOCKED`.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts)
  - `worker claims queued recordings and processes full pipeline independently of client connection`

---

## 4. Bottlenecks

### P1. Unbounded Notes in AI Prompt
- **Resolution in v2:** Prompts select bounded subset of relevant notes with character caps.
- **Proving Test:** [`apps/api/src/modules/ai/domain/extraction.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/ai/domain/extraction.test.ts)

### P2. Hourly Sweep Touching All Profiles
- **Resolution in v2:** Sweep queries filter conditionally on `status = 'held' AND created_at < NOW() - INTERVAL '1 hour'`, touching only expired rows.
- **Proving Test:** [`apps/api/src/modules/credits/credits.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/credits/credits.test.ts)

### P3. Transcription Timeout Lack
- **Resolution in v2:** Every external provider request carries an explicit timeout signal (`AbortSignal.timeout(...)`).
- **Proving Test:** [`apps/api/src/modules/transcription/transcription.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/transcription/transcription.test.ts) & [`apps/api/src/modules/ai/ai.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/ai/ai.test.ts)

### P4. Canvas Viewport Culling & Memoization
- **Resolution in v2:** Virtualized note rendering and `React.memo` on sticky note items in `apps/web`.

### P5. Inefficient Cache Invalidation
- **Resolution in v2:** TanStack Query in-place updates for note color, position, and title mutations without re-fetching entire space note lists.

### P6. Base64 In-Memory Audio Buffering
- **Resolution in v2:** Streaming uploads piped directly to disk (`DiskBlobStore`) and streamed directly to ffmpeg and provider requests.
- **Proving Test:** [`apps/api/src/modules/recordings/recordings.test.ts`](file:///var/www/html/old/mindspace-v2/apps/api/src/modules/recordings/recordings.test.ts)
