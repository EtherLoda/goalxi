# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoalXI is a football manager game with real-time match simulation, team management, transfer market, and league competitions. It's a monorepo with pnpm workspaces containing NestJS microservices and a Next.js frontend.

## Tech Stack

- **Backend**: NestJS 10/11 with TypeORM, PostgreSQL, Redis, BullMQ
- **Frontend**: Next.js 16.2.3 (App Router), React 19.2.4, TailwindCSS 4
- **Package Manager**: pnpm 9.12.3
- **Language**: TypeScript 5.6+

## Project Structure

```
GoalXI/
├── api/           # Main API service (port 3000)
├── simulator/     # Match simulation microservice
├── settlement/    # Financial settlement microservice
├── web/           # Next.js frontend (port 8000)
├── libs/database/ # Shared TypeORM entities
└── pnpm-workspace.yaml
```

## Development Commands

```bash
# Root - run all services in parallel
pnpm dev

# Build all packages
pnpm build
```

### API (api/)
```bash
cd api
pnpm start:dev          # Hot reload development
pnpm lint               # ESLint + Prettier
pnpm test               # Jest tests
pnpm test:cov           # With coverage
pnpm migration:up       # Run TypeORM migrations
pnpm seed:run           # Seed initial data
pnpm dev:seed           # Seed dev test data
```

### Simulator (simulator/)
```bash
cd simulator
pnpm start:dev          # Hot reload development
pnpm lint               # ESLint + Prettier
pnpm test               # Jest tests
```

### Web (web/)
```bash
cd web
pnpm dev                # Next.js dev server on port 8000
pnpm build              # Production build
pnpm lint               # ESLint
pnpm test               # Playwright E2E tests
pnpm test:unit          # Jest unit tests
pnpm test:unit:cov      # Jest with coverage
```

## Key Architecture Patterns

### Database Entities

All entities are in `libs/database/src/entities/` and extend `AbstractEntity` (id, createdAt, updatedAt). Import via `@goalxi/database`.

**Core entities**:
- `PlayerEntity` - Players with skills (physical, technical, mental, setPieces), potential, stamina, form
- `TeamEntity` - Teams with benchConfig for substitution management
- `MatchEntity` - Match status: scheduled → tactics_locked → in_progress → completed
- `MatchEventEntity` - Goals, cards, substitutions, VAR events

### Match Simulation Engine

The simulator microservice runs match logic in `simulator/src/engine/match.engine.ts`. Key concepts:
- **Position keys**: GK, CD/CDL/CDR, LB/RB/WBL/WBR, LW/RW/LM/RM, AM/CM/DM variants, CFL/CF/CFR
- **BenchConfig**: Maps bench positions to substitute player IDs
- **Event types**: goals, shots, corners, fouls, cards, substitutions, injuries, penalties, offside, free kicks
- **ConditionSystem**: Handles player stamina and fatigue during matches

### API-FE Communication

- **API base**: `http://127.0.0.1:3000/api/v1`
- **Frontend client**: `web/src/lib/api.ts` - Centralized fetch wrapper
- **Auth**: JWT stored in `localStorage.getItem('goalxi_token')`

**Key endpoints**:
- `PATCH /teams/:id/bench-config` - Update substitution configuration
- `POST /matches/:id/simulate` - Trigger match simulation
- `GET /matches/:id/events` - Live match events
- `POST /matches/:id/tactics` - Submit team tactics
- `GET /forum/categories` - List forum categories
- `GET /forum/categories/:slug/threads` - List threads in a category (supports `?sort=latest|hot`)
- `POST /forum/categories/:slug/threads` - Create thread (auth)
- `GET /forum/threads/:id` - Thread detail + first post body
- `POST /forum/threads/:id/posts` - Reply to thread (auth)
- `POST /forum/posts/:id/reactions` - Toggle like on post (auth)

### Forum Feature

Community forum lives at `api/src/api/forum/` and `web/src/app/forum/`. Entities in `libs/database/src/entities/forum/`:
- `ForumCategoryEntity` - Read-only seeded categories (announcements, general, tactics, transfer-market)
- `ForumThreadEntity` - Thread with title, body, replyCount, hotScore
- `ForumPostEntity` - Reply on a thread
- `ForumReactionEntity` - Like-only reactions (`type='like'`)

**MVP scope**: No category creation (seeded only), no edits (delete + repost), no Markdown, no view count, no moderator system. See `C:\Users\Administrator\.claude\plans\robust-exploring-meerkat.md` for the deferred P1+ work.

### Youth Pipeline (post-RFC 0001)

> **FROZEN — do not develop, extend, or "improve" this subsystem without
> an explicit go-ahead from the maintainer.**
>
> Youth development is paused indefinitely. The code below is
> **documentation of what exists**, not a specification of what should
> be built. Specifically:
>
> - **No new features.** Do not add youth scouts, youth tactics depth,
>   academy upgrades, loan pathways, or a Youth Mode toggle.
> - **Do not "fix" the known rough edges** listed under *Known
>   limitations* — several were left deliberately, and "fixing" one
>   silently re-activates a path nobody has validated.
> - **The reveal/promote loop is half-wired on purpose.** See *Known
>   limitations* → "The promotion gate can never be satisfied for a
>   team-less youth". Fixing it requires a product decision, not a code
>   change.
> - **Bug fixes are still welcome** where the subsystem is actively
>   running (it generates and simulates youth fixtures every matchday).
>   Keep those minimal and self-contained.
> - **Runtime behaviour is unchanged and must stay that way.** The
>   weekly worker still ticks, youth fixtures are still generated and
>   simulated. Freezing means *hands off*, not *shut it down*.
>
> If you believe something here genuinely must change, say so and wait
> for an answer rather than fixing it in passing. A drive-by "cleanup"
> in this area has already caused one regression (the un-swappable
> playoff ladder, fixed in the 2026-09 batch).

The youth flow was consolidated into `player` (RFC 0001, migration `1722000000000`). No more separate `youth_player` / `youth_match` tables — youth rows sit in the unified tables with `is_youth = true` and `youth_league_id` set.

**Pyramid bootstrap** (`settlement/src/bootstrap/`):
- `LeagueGenerator.generatePyramid()` runs first → 85 senior leagues (L1 + 4 L2 + 16 L3 + 64 L4).
- `TeamGenerator.generateAllTeams()` populates each senior league.
- `YouthStructureGenerator.generate()` (WAVE A1) creates exactly **1 `youth_league` per senior_league** (1:1 by `senior_league_id`) and **1 `youth_team` per senior_team** (1:1 by `team_id`). Idempotent; skipped for teams with no `leagueId`.
- `ScheduleGenerator.generateSeason1Schedule()` (WAVE A2) generates senior fixtures AND youth fixtures. Youth matches have `leagueId = null` and `youthLeagueId` set. Every match (senior + youth) gets a real `scheduledAt` so the preprocessor's `LessThanOrEqual(lockThreshold)` filter picks them up. Youth matches are offset by **2 days** from the senior schedule so they don't open for tactics at the same instant.

**Youth coach model** — *paused*: the `StaffRole.YOUTH_COACH` enum member, the
`applyYouthCoachCategoryTraining` helper, and the youth-coach branches in
`staffs.service.ts` were removed in the YOUTH_COACH-removal batch. The
Postgres enum value was dropped by migration `1724000000000`. The
`youth-progression-settlement` worker still runs every Thursday at
00:00 UTC but only handles `applyWeeklyGrowth` (base growth) and
`pickNextRevealSkills` (fog reveal) — there is no coach bonus any more.
Re-introducing the role requires restoring the enum value, the training
helper, and the validation/assignment branches together; don't peel them
back apart.

**Promotion gate** (WAVE B1, **server-enforced**):
- `PlayerService.promote()` flips `is_youth=false` and clears the reveal mask. Throws `ForbiddenException` if `revealedSkills.length < ceil(PROMOTION_REVEAL_THRESHOLD * totalKeys)`. Outfield needs ≥ **5/10** unlocked skills; goalkeeper ≥ **5/9**.
- Constant: `PROMOTION_REVEAL_THRESHOLD = 0.5` in `libs/database/src/constants/youth-keys.constants.ts`. Update `revealLevel` together with `revealedSkills.length` (the processor keeps them in sync).
- Curl/Postman cannot bypass — the gate runs on the server before any state mutation.

**Release endpoint** (WAVE B2):
- `POST /players/:id/release` soft-deletes a youth (`PlayerEntity.softRemove()`, preserves the row for event history). Refuses senior players (400) so a UI typo cannot dump a contracted first-teamer.
- The generic `DELETE /players/:id` is preserved untouched for admin-level hard deletes.

**Down-migration gotcha** (WAVE B3):
- `1722000000000-UnifyYouthIntoPlayer.down()` originally selected `p."joined_at"` from the unified `player` table. That column was already dropped by migration `1721000000000` (ReplaceBirthdayWithCreatedDay), so a real rollback would 5xx. The down() now backfills `joined_at` with `p."created_at"`. There is a static-tripwire spec at `1722000000000-UnifyYouthIntoPlayer.spec.ts` that fails if the bad reference reappears.

**Tactical dimensions** (WAVE B4):
- `YouthTacticsEditor` (`web/src/components/youth/YouthTacticsEditor.tsx`) drives `tempo` / `pitchWidth` / `defensiveLine` from user-controlled state via the `TacticalDimensionRow` toggle-row component. Initialized from `initialTactics` when present; falls back to `balanced` / `balanced` / `mid`. i18n keys live under `youth.matches.editor.{tempo,pitchWidth,defensiveLine}` in `web/messages/{en,zh}.json`.

**Where to look** when changing anything in this subsystem:
- `libs/database/src/constants/youth-keys.constants.ts` — `PROMOTION_REVEAL_THRESHOLD`, `YOUTH_PROMOTION_*`.
- `libs/database/src/services/youth-progression.ts` — pure functions: `applyWeeklyGrowth`, `pickNextRevealSkills`. The settlement worker is the only caller in production today.
- `settlement/src/processors/youth-progression.processor.ts` — BullMQ worker for the weekly tick. Now only does base growth + reveal (no coach bonus).
- `settlement/src/bootstrap/generators/youth-structure.generator.ts` — idempotent 1:1 creator.
- `api/src/api/scouts/scouts.service.ts` (`selectCandidate`) — player is dropped here with: `position` (from candidate), `potentialAbility` recomputed from `potentialSkills` (NOT a hardcoded 50 anymore), `revealLevel` derived from `revealedSkills.length`.

**Known limitations** — *left deliberately under the freeze. Do not
"fix" these without maintainer sign-off; each one looks like a bug but
repairing it re-opens a path the paused subsystem never validated.*

- **The promotion gate can never be satisfied for a team-less youth.**
  `YouthProgressionProcessor` skips `!player.teamId` rows *before*
  calling `pickNextRevealSkills`, so their `revealedSkills` stays `[]`
  forever; `PlayerService.promote()` requires ≥ 5 revealed. A team-less
  youth is therefore permanently unpromotable. In practice no such rows
  exist — `youth-structure.generator.ts` only creates `youth_team` rows
  for senior teams that have a `leagueId`, and `selectCandidate` always
  sets `teamId` — so this is defensive dead code, not a live defect. The
  options were A (also reveal team-less youth), B (special-case the gate
  in `promote`, which WAVE B1 exists to prevent), C (assert they can't
  exist). **C is the honest one** but needs a data audit first.
- **`PlayerEntity.matchMinutes` is excluded for youth in
  `resetMatchMinutesForBotTeam` but included in the senior path.** Youth
  on bot teams therefore accumulate minutes unbounded — the same growth
  class the senior branch was fixed for. Left alone because bot-academy
  state is itself frozen.
- **`player.generation`/age semantics are loose.** `applyWeeklyGrowth`
  has no age curve (unlike senior `getAgeTrainingFactor`), so a
  long-tenured `is_youth` row keeps growing at the 16-year-old rate.
- **No youth retirement.** A player who never gets promoted stays youth
  forever and grows without bound toward potential.

### Onboarding pipeline (manager register → claim a BOT team)

Replaces the old `POST /teams/:id/apply` flow which was `@Public()` and took a `userId` in the body — a deliberate "any caller can gift a BOT to any user" hole. The new pipeline is auth-gated, asynchronous, and uses the JWT identity to decide ownership.

**State machine** (in `UserEntity.onboardingStatus`):

```
TEAMLESS ──(api enqueues job)──▶ PROCESSING ──(worker claims)──▶ ACTIVE
   ▲                                                                  │
   └──────────── (admin reset / team hard-deleted) ──────────────────┘
```

- `TEAMLESS` is the default for every freshly-registered user.
- `PROCESSING` is the "work in flight" signal the polling UI relies on; it is **not** a default state.
- `ACTIVE` means the user owns a non-BOT team row.

**Allocation policy** (`PHASE1_FILL_THRESHOLD = 0.5` in `libs/database/src/services/onboarding-assigner.ts`):

1. **Phase 1** — among leagues with a player ratio below 50%, pick the one with the lowest ratio. Tie-break by tier ASC + tierDivision ASC. Within the chosen league, claim the **lowest-ELO** BOT, tie-break by createdAt ASC.
2. **Phase 2** — once every league is past 50%, fall back to round-robin: pick the league with the most remaining BOTs (most capacity), claim the lowest-ELO BOT inside it.
3. **No BOT is re-created** to backfill a claimed slot. The design is "BOTs retire as players arrive" — `league.maxTeams` is informational only and the live `team` count for a league will gradually shrink.

**Pipeline**:

| Step | Where | What |
|---|---|---|
| Register | `api/src/api/auth/auth.service.ts` → `register()` | Creates user, queues verification email, enqueues `assign-team` BullMQ job, returns immediately with `status: 'teamless'` |
| Poll | `GET /onboarding/state` (auth) | Returns `{ status, hasTeam, team }` — frontend polls this on every navigation |
| Retry | `POST /onboarding/claim` (auth) | Manually re-enqueues the job if user is stuck in PROCESSING |
| Worker | `settlement/src/processors/onboarding.processor.ts` | Consumes the job, calls `OnboardingAssigner.claim` (transactional claim + status flip), seeds the first scout candidate via `seedSeniorScoutCandidate` |

**Where to look** when changing anything in this subsystem:

- `libs/database/src/services/onboarding-assigner.ts` — pure assigner (`claim`, `markProcessing`, error types). Shared by API read-side and settlement write-side.
- `libs/database/src/services/senior-scout-generator.ts` — pure scout seed (`generateSeniorScoutCandidate`, `seedSeniorScoutCandidate`). Both the API and the onboarding worker use it.
- `api/src/api/onboarding/onboarding.service.ts` — read-side (`getOnboardingState`) and enqueue helper (`enqueueAssignTeam`).
- `api/src/api/onboarding/onboarding.controller.ts` — `GET /onboarding/state` + `POST /onboarding/claim`.
- `api/src/api/auth/auth.service.ts` (`register`) — single source of the "register → enqueue" handoff.
- `api/src/constants/job.constant.ts` — `QueueName.ONBOARDING = 'onboarding-assignment'` and `QueuePrefix.ONBOARDING = 'onboarding'`.
- `settlement/src/processors/onboarding.processor.ts` — worker; classifies errors (`OnboardingNoBotAvailableError` → `UnrecoverableError`, `OnboardingClaimRaceError` → retry).
- `settlement/src/onboarding.module.ts` — wires the queue to the processor.
- `web/src/app/[locale]/onboarding/select/page.tsx` — the loading screen the user sits on while the worker runs.
- `web/src/contexts/AuthContext.tsx` — reads `/onboarding/state` on every navigation; if `hasTeam=false`, bounces the user to `/onboarding/select`.

**Idempotency**:

- The assigner is idempotent: if the user already owns a non-BOT team, `claim` returns the existing team with `reused: true` and does NOT touch any row. This is what makes the manual retry endpoint safe.
- The BullMQ jobId is `assign-team:${userId}`. A re-enqueue while a job is already in flight is a no-op (see `OnboardingService.enqueueAssignTeam`'s `getJob` dedup check).
- The user's `markProcessing` UPDATE is filtered to `onboardingStatus != 'active'`, so a worker that picks up a job for an already-ACTIVE user (e.g. a job from a manual retry) does NOT bounce them back to PROCESSING.

**Concurrency**:

- The whole claim runs inside a `dataSource.transaction` and the BOT pick uses `pessimistic_write`. Two concurrent registrations cannot both pass the `isBot=true` check; the second waits for the first to commit, then sees `userId !== null` and throws `OnboardingClaimRaceError`, which BullMQ retries with `attempts: 3, backoff: { type: 'exponential', delay: 1500 }`.

## Player-facing help: no engine internals

When building any **player-facing** content (the in-app help assistant, FAQ entries, tutorial copy, support responses, marketing copy), **never reveal engine internals** like position-weight coefficients, PWI formula details, injury-penalty coefficients, or specialty multipliers. Players only need to know "which skills are key/important" — not the specific weights.

**Drop from player-facing copy**:
- Per-position weight numbers (e.g. `pace: 16, dribbling: 12` from the LW weight matrix)
- The full PWI formula `(weightedSum / 30) ^ 2.2 × 100 × potentialFactor × formFactor`
- The GK save formula `reflexes×4 + handling×2.5 + ...`
- Lane-weight percentages (`64% on the left lane`)
- Exact skill thresholds (`≥ 14`, `≥ 12`)
- Specialty tier multipliers (`+15-25%`, `+8-15%`, `+3-8%`)
- Injury-penalty coefficients (`0.95`, `0`)
- Specific overall-number ranges for tiers (`5-6 档 overall`)

**Keep in player-facing copy**:
- Tier label names (LOW / REGULAR / HIGH_PRO / ELITE / LEGEND) — these are product UI badges, not engine internals
- Relative qualitative comparisons ("WBL 比 LB 进攻属性高很多")
- Priority labels (极重要 / 重要 / 次要 / 辅助)
- Position names + role descriptions
- Formation codes (`4-3-3`, `3-5-2` — player-facing knowledge)
- Practical gameplay tips (qualitative)
- Game pacing (e.g. "1-2 game days for the first bid")
- **Game-mechanics numbers** that a player can observe by playing — match-type EXP multipliers (`5x` national team, `1x` league, `0.1x` friendly, `0` tournament), level cap (`max 20`), the 5-tier color band labels, etc. The line: if reading engine source is required to know it, it's an internal; if the player can verify it by playing, it's a game fact and can be exposed.

**What is NOT a game-mechanics number** (still off-limits even if asked):
- PWI formula internals (e.g. the `2.2` exponent, the `1.0-2.5×` potentialFactor range)
- Position-weight coefficients (e.g. `LW left/attack = pace:16, dribbling:12`)
- Lane-weight percentages (e.g. `64% on the left lane`)
- Injury-penalty coefficients (`0.95` minor, `0` severe)
- Specialty tier multipliers (`+15-25%` GOLD, etc.)
- Any explicit weighted-sum formula or sigmoid curve in player-facing copy

**Where it applies**:
- `web/src/data/help/*.json` — the help KB (zh + en per module)
- Any future in-app help assistant
- Forum announcements, support replies, marketing copy

**Anchor**: `web/src/data/help/faq.zh.json` + `faq.en.json` — v3 player module (21 entries). v1 leaked the full engine weight matrix, v2 added the `noInternalNumbers: true` schema flag, v3 added the `noSilentOmission: true` flag (see next section). Loader can lint both flags at runtime.

## Player-facing help: no silent omission

When writing any **comparison** or **priority** entry in the help KB, **cover all relevant skills completely** — never silently drop a skill. If a skill is "low impact" for the position, say so explicitly; don't just skip it.

Concretely:
- **Outfield positions** must list all **10** outfield skills (pace, strength, finishing, passing, dribbling, defending, positioning, composure, freeKicks, penalties) — each one either at a tier or in the "almost no impact" bucket with a one-line reason
- **GK** must list all **9** GK skills (reflexes, handling, aerial, pace, strength, positioning, composure, freeKicks, penalties) — same rule
- A comparison entry that covers only "the ones that differ" and skips the rest is **broken** even if the differences are correct — players reading it can't tell whether the missing skills are "equal" or "irrelevant"
- For the "almost no impact" tier, the one-line reason is mandatory (e.g. "W doesn't need positioning" vs "freeKicks are position-independent" — both are "low" but for different reasons)

The KB schema carries a top-level `noSilentOmission: true` flag so the loader / runtime can lint that every comparison/priority entry explicitly accounts for all 10/9 skills.

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Jest for testing
- Conventional commits (commitlint configured)
