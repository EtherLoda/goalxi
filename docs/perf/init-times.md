# Init Pipeline Wall-Clock

Single-shot measurements of `pnpm --filter settlement
init:run --init-date=YYYY-MM-DD --force` against the
test DB. The init log line we key off is

    [Init] done in <elapsedMs>ms — <leagues> leagues, <teams> teams, <matches> matches

(elapsedMs is computed in `InitService.run` from
`Date.now()` deltas around the pipeline).

## Why a perf log

After the Batch B / Batch C refactors (batched
`TeamGenerator.enrichAllTeams` from 2720 round-trips
to 6, parallelised `InitService` 5-9 pass from
serial to `Promise.all`, dedup'd name picker, etc.)
the pipeline is materially faster but we don't have
a continuous record. This file is the ledger.

## Measurements

| Date | Mode | elapsedMs | leagues | teams | matches | commit | notes |
|---|---|---|---|---|---|---|---|
| 2026-08-26 | full (85 leagues, 1360 teams) | 108498 | 85 | 1360 | 20400 | `2d4a964` | first post-refactor measurement; full pyramid with `init_date=2026-08-24` |
| 2026-08-26 | full (85 leagues, 1360 teams) | 126179 | 85 | 1360 | 20400 | `8baa766` | post-Thielen CSP — same full pyramid, init_date=2026-08-17; ~17.7s regression vs the `2d4a964` row above. Almost entirely the schedule generator's new per-league backtracking (N=16 is the worst case in the pyramid; 85 CSP runs). The 17s is amortised over the full wipe + setup so the user-facing impact is small. Revisit if init regresses further; the CSP itself is microseconds, the rest is most likely a cold-DB or scheduling jitter, not the algorithm. |
| 2026-08-26 | `--small` (1 L1 + 1 L2) | 4002 | 2 | 32 | 480 | `8baa766` | first small-pyramid baseline; post-Thielen CSP (commit `8baa766`); the schedule generator now runs a backtracking CSP per league — adds ~ms per league but the wall-clock is still wipe-bound for small mode |

`commit` is the `git rev-parse --short HEAD` of
the tree the measurement was taken against, so
regressions can be bisected by commit.

## Reading a number

- `elapsedMs` is the wall-clock between
  `InitService.run` start and the final summary
  line — it INCLUDES the `--force` wipe (the
  `TRUNCATE … CASCADE` round-trip). For a
  wipe-only comparison, see the per-step
  breakdown in the init log.
- The "parallel pass" (steps 5-9) wall-clock is
  `max(t_presets, t_scout, t_schedule, t_weather,
  t_announcement)` since `b1bcf4c` — previously
  it was the sum.
- The post-enrichment step is bounded by
  `ceil(teams / 500)` × 2 round-trips since
  `6aa85a1` — previously it was `teams × 2`.

## How to add a row

1. `git rev-parse --short HEAD` to get the commit
   column.
2. Run the init and copy the `[Init] done in Nms`
   line (or the whole summary).
3. Add a row to the table above.

For a clean measurement, set `GAME_START_DATE`
to match `--init-date` and pre-warm the DB
connection (`pnpm --filter api start:dev` until
the connection pool stabilises, or just
re-`init:run` twice and take the second).
