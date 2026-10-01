# GoalXI - Football Manager Game

GoalXI is a modern, web-based football manager game where users manage their own football teams, compete in leagues, trade players, and simulate matches with detailed tactical control.

## 🚀 Features

### 🏟️ Match Simulation Engine
- **Real-time Simulation**: Matches are simulated event-by-event with a sophisticated probability engine.
- **Tactical Control**: Set formations, lineups, and instructions. Adjust tactics before matches.
- **Live Events**: Watch matches unfold with live commentary and event updates (Goals, Cards, Substitutions, VAR).
- **Detailed Stats**: Comprehensive post-match statistics including possession, shots, xG, and player ratings.

### 👥 Team Management
- **Squad Building**: Manage your roster, train players, and handle contracts.
- **Transfers & Auctions**: Buy and sell players in a dynamic market with real-time bidding.
- **Youth Academy**: Scout and develop young talent.

### 📊 Statistics & Analysis
- **Player Career Tracking**: Detailed history of every player's career including goals, assists, and transfer history.
- **League Tables**: Automated league standings and fixtures.
- **Financial Management**: Track income, expenses, and sponsorship deals.

## 🛠️ Tech Stack

- **Backend**: NestJS (Node.js), TypeORM, PostgreSQL, Redis, BullMQ
- **Frontend**: Next.js 16.2.3 (App Router), React 19.2.4, TailwindCSS 4, next-intl, Zustand
- **Infrastructure**: Docker, Docker Compose

## 📂 Project Structure

This is a **pnpm workspace monorepo** with four services and shared libs:

- `api/`: Main HTTP API service (NestJS) — controllers, RBAC, finance, league, match, transfer, user, etc.
- `simulator/`: Dedicated microservice for match simulation (NestJS) — listens to the `match-simulation` BullMQ queue.
- `settlement/`: Dedicated microservice for all post-match, weekly, and seasonal settlement (NestJS). See [Settlement module](#settlement-module) below.
- `libs/`: Shared libraries used by every service.
  - `libs/database/`: TypeORM entities, enums, constants, and the **shared** `currentSeasonWeek` / `resolveGameStart` helpers.
  - `libs/logger/`: Pino-based logger DI token.
- `web/`: Next.js frontend application (port 8000).

## 🚦 Getting Started

### Prerequisites
- Node.js (v18+)
- pnpm
- Docker & Docker Compose

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/EtherLoda/goalxi.git
   cd goalxi
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start Infrastructure (DB, Redis)**
   ```bash
   docker-compose up -d
   ```

4. **Run Migrations**
   ```bash
   cd api
   pnpm typeorm migration:run
   ```

5. **Start Services**
   ```bash
   # Terminal 1: API
   cd api
   pnpm start:dev

   # Terminal 2: Simulator
   cd simulator
   pnpm start:dev

   # Terminal 3: Settlement
   cd settlement
   pnpm start:dev
   ```

## Settlement module

`settlement/` is the post-match + weekly + seasonal bookkeeping service. It owns:

- **Schedulers** (`@Cron`-driven) — `MatchSchedulerService` (preprocess → start → complete), `WeeklySettlementService` (Thursday tick), `PlayerWageSchedulerService`, `InjuryRecoveryService` (daily 02:00), `SeasonTransitionService` (Mon/Tue), `ScoutSchedulerService`, `WeatherSchedulerService`, `LeagueAwardService` (Sunday week-15), `FinanceSchedulerService`.
- **Processors** (BullMQ workers) — `TrainingProcessor`, `ConditionProcessor`, `PlayerWageProcessor`, `StadiumConstructionProcessor`, `YouthProgressionProcessor`, `TransferProcessor`, `SimulationProcessor` (lives in `simulator/`).
- **Cross-cutting services** — `PromotionRelegationService` (tier ladder + playoff swap), `PlayoffService`, `SeasonArchiveService` (writes the `archived_*` mirror tables at season end), `LeagueAdminService` (createLeague / addTeam / removeTeam), `LeagueStandingService`, `SeasonSchedulerService`.

### One source of truth for the game clock

A single env var — `GAME_START_DATE` — anchors the in-game calendar. Every service that needs to know "what season / week is it right now?" calls:

```ts
import { currentSeasonWeek, resolveGameStart } from '@goalxi/database';

const gameStart = resolveGameStart(process.env.GAME_START_DATE); // UTC midnight of that day
const { season, week } = currentSeasonWeek(new Date(), gameStart); // 1-indexed week, 16-week season
```

- `resolveGameStart` accepts `YYYY-MM-DD` or a full ISO timestamp; falls back to today UTC midnight when unset.
- The constant is resolved **once at service construction** and reused for every job in the process lifetime. A worker restart at 23:59 / 00:00 doesn't straddle a week boundary.
- The fallback (no env var) is dev-only — `main.ts` in `api` and `settlement` WARN-logs loudly when it fires so the missing-config case is obvious in the boot logs.

**Production rule:** set `GAME_START_DATE=YYYY-MM-DD` in every replica's env. Without it, two replicas can disagree on the season anchor.

### Idempotent weekly ticks

`WeeklySettlementService` and `PlayerWageSchedulerService` set a **business jobId** on every BullMQ enqueue (`weekly-settlement-${weekKey}-${teamId}`, `player-wage-${dayKey}-${teamId}`). BullMQ rejects duplicate jobIds, so re-enqueueing the same tick is a cheap natural idempotency layer — processors don't need their own check. The four fan-out queues per weekly tick run via `Promise.allSettled` so a single queue failure doesn't take down the other three.

### Race-free match transitions

`MatchSchedulerService` (preprocessMatch, startMatches, completeMatches) writes through `matchRepository.update({ id, status: <expected> }, ...)` rather than `save()`. The status-in-WHERE clause is a CAS: two cron ticks racing the same row only flip the first one through, and the loser's `affected === 0` makes it skip the queue enqueue silently. Critical for `preprocessMatch` whose simulation jobId is fresh per enqueue (a double-enqueue used to mean two workers on one match).

### Per-team transactions in batch processors

`TrainingProcessor` and `ConditionProcessor` wrap each team's writes in `dataSource.transaction(...)`, and `playerRepository.save(dirtyPlayers)` is a single batched call. Read queries stay on the non-tx repos so the transaction window is just the writes. A bad row on team A must not roll back team B's already-computed work.

### Per-day injury recovery (was N+1)

`InjuryRecoveryService.processDailyInjuryRecovery` used to issue (per injured player) a team lookup + a doctor lookup, plus (per recovered player) an active-injury lookup + a player-with-team lookup. The query budget is now fixed at 4 — see `injury-recovery.service.ts` for the doctorByTeam / activeInjuryByPlayer / recoveredPlayerById map structure.

## 🚀 Production deployment (`MODULES_SET`)

The API container can boot in three modes controlled by the
`MODULES_SET` env var. **It defaults to `api`.** An unrecognised
value fails the boot rather than silently starting a
near-empty process.

| Mode         | HTTP API | api-owned queue consumers | Use it for                                   |
| ------------ | :------: | :-----------------------: | -------------------------------------------- |
| `api`        |    ✅    |            ✅             | the public-facing API container (default)    |
| `background` |    ❌    |            ✅             | a worker sidecar that needs no HTTP surface  |
| `monolith`   |    ✅    |            ✅             | **deprecated alias of `api`** — boots the same |

> **Settlement cron has exactly one owner: the `settlement`
> service.** The API process used to mount settlement's
> `SchedulerModule` (via a cross-package import of
> `settlement/dist`) and run its ~26 `@Cron` handlers *as well*.
> Since the `settlement` service boots those same handlers itself,
> every default deployment — root `pnpm dev` and the shipped
> `api/docker-compose.yml` — fired each one **twice, in two
> processes**. Handlers with multi-step unwrapped writes
> (season transition, promotion/relegation, standings init) had
> **no distributed lock** and double-wrote rows. A few were saved by
> CAS/latch logic, which is why it went unnoticed.
>
> The import is gone. `MODULES_SET` in the api process no longer
> affects which cron runs — it never should have. See
> `api/src/background/background.module.ts`.
>
> `monolith` remains accepted so existing deploys don't break, but
> it is now an exact alias of `api` and does **not** imply
> settlement cron. If you were relying on `monolith` to run the
> game clock, note that the `settlement` container already does.

The bootstrap log line is your canary — every API process prints
`[Bootstrap] MODULES_SET=<value> cronOwner=settlement` at startup.
The explicit `cronOwner` is there so that anyone re-introducing a
second owner sees the contradiction immediately.

The same concern applies to the `settlement` service: it has
its own `@Cron` handlers and BullMQ workers, so even a single
`settlement` replica can race itself if two ticks overlap
(match preprocessing plus weekly settlement can both run at
00:00). The `simulator` service is the worst case — it
double-handles a `match-simulation` job by design, and relies
on the worker's `simulation_started_at` atomic claim to make
that safe.

Example production stack:

```yaml
# docker-compose.prod.yml
services:
  api:
    image: goalxi-api
    environment:
      MODULES_SET: api          # HTTP only
      GAME_START_DATE: 2025-01-01
  api-worker:
    image: goalxi-api
    environment:
      MODULES_SET: background  # queue consumers, no HTTP
      GAME_START_DATE: 2025-01-01
  simulator:
    image: goalxi-simulator
    environment:
      GAME_START_DATE: 2025-01-01
  settlement:
    image: goalxi-settlement
    environment:
      GAME_START_DATE: 2025-01-01
```

## 🧪 Testing

```bash
# Run all tests across every workspace
pnpm -r test

# Run a single service's tests
pnpm --filter settlement test
pnpm --filter api test
pnpm --filter simulator test
pnpm --filter @goalxi/database test
```

Test layout per service follows the source tree — `*.spec.ts` files live next to the unit they cover. Use `jest --runInBand` to avoid parallel-worker DB contention when running a single suite.

## 📖 Documentation

- [Database Schema](api/docs/database-schema.md)
- [API Documentation](api/docs/api-documentation.md)

## 🤝 Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`pnpm commit` — see Conventional Commits)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
