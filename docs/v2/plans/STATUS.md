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
| 08 | Partial: stopped at the 50-minute limit, not reviewed by Claude |
| 09 | Not started |
| 10 | Not started |
| 11 | Not started |
| 12 | Not started |

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
