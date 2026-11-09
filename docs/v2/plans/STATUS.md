# Status

| Phase | State |
|---|---|
| 01 | Done, verified by Claude |
| 02 | Done, verified by Claude |
| 03 | Done, verified by Claude |
| 04 | Done, verified by Claude |
| 05 | Done, verified by Claude |
| 06 | Done, verified by Claude |
| 07 | Done, verified by Claude |
| 08 | Reviewed by Claude in a browser at phone width, defects fixed |
| 09 | Reviewed by Argon |
| 10 | Reviewed by Argon |
| 11 | Reviewed by Argon |
| 12 | Reviewed by Argon |
| 13 | Reviewed by Claude in a browser at phone width, defects fixed |
| 14 | Done |

## Continuing without Claude

```bash
scripts/run-remaining.sh 08 09 10 11 12
```

Each phase runs on Argon, the API check runs from a wiped database, and the phase is committed locally. The script stops at the first failure. Nothing is pushed.

## What review found in phases 01 to 06

Gemini reported every phase as done with passing tests, yet review found real defects in four of them. Check these on every remaining phase:

- **Races:** check-then-write outside a transaction. Fix with conditional `UPDATE ... RETURNING` (phases 02, 03).
- **Rollback traps:** work that must persist, done inside a transaction that then throws (phase 02).
- **Tests on dirty state:** tests passed only because a database was already set up. Always run the check after `docker compose --profile tools down -v` (phase 02).
- **Unsafe fallbacks:** defaults such as an empty secret instead of failing (phase 02).
- **Unbounded input:** a limit on size but not on count (phase 05).
- **Error envelopes:** framework defaults instead of `{"error","message"}` (phase 01).
- **Port drift:** prompts must stay byte-identical to `supabase/functions/_shared/prompts`.
- **Report vs reality:** a run can end `ERROR` on a network failure while its output says `done`. Trust only the checks you run yourself.

## What review found in phases 08 and 13

Every workspace's tests passed while all of these were broken. Unit tests with mocked `fetch` cannot see them, so check real requests in a browser.

- **Client and server disagreed:** `/billing/plans`, `/billing/subscription`, bulk-create body and URL.
- **Bodiless requests:** a JSON `Content-Type` with no body made Fastify return 400 on every DELETE.
- **Concurrent refresh:** rotation reuse logged the user out on every page reload.
- **Stacking:** a sheet inside the header sat under the dock.
- **Cookie scope:** `api.domain` cookies are invisible to `domain` without `COOKIE_DOMAIN`.
- **Lockfile:** resolved URLs pointed at a third-party mirror.
