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

The youth flow was consolidated into `player` (RFC 0001, migration `1722000000000`). No more separate `youth_player` / `youth_match` tables — youth rows sit in the unified tables with `is_youth = true` and `youth_league_id` set.

**Pyramid bootstrap** (`settlement/src/bootstrap/`):
- `LeagueGenerator.generatePyramid()` runs first → 85 senior leagues (L1 + 4 L2 + 16 L3 + 64 L4).
- `TeamGenerator.generateAllTeams()` populates each senior league.
- `YouthStructureGenerator.generate()` (WAVE A1) creates exactly **1 `youth_league` per senior_league** (1:1 by `senior_league_id`) and **1 `youth_team` per senior_team** (1:1 by `team_id`). Idempotent; skipped for teams with no `leagueId`.
- `ScheduleGenerator.generateSeason1Schedule()` (WAVE A2) generates senior fixtures AND youth fixtures. Youth matches have `leagueId = null` and `youthLeagueId` set. Every match (senior + youth) gets a real `scheduledAt` so the preprocessor's `LessThanOrEqual(lockThreshold)` filter picks them up. Youth matches are offset by **2 days** from the senior schedule so they don't open for tactics at the same instant.

**Youth coach model** (WAVE 0/1b):
- `StaffEntity.role = StaffRole.YOUTH_COACH` — **exactly one per team** (maxed at the assignment level via `getMaxPlayersForRole`).
- The chosen category lives on `staff.trainedSkill` (one of `physical` / `technical` / `mental` / `setPieces` / `goalkeeper`). Unlike senior coaches where the role locks the category, a youth coach's category is **switchable** at any time via `PATCH /staffs/:id/trained-skill` (validated by `isYouthCoachCategory`).
- Up to **3 youth players** can be assigned via the existing `CoachPlayerAssignmentEntity` (`coachId` + `playerId` + `trainingCategory`). Conflicts in the same category auto-unassign the previous coach.
- `assignPlayer` rejects outfield youths from a coach on `goalkeeper` category (no skills to train) and rejects assignment when `coach.trainedSkill` is not set.
- Weekly tick: `YouthProgressionProcessor` (queue `youth-progression-settlement`, fired Thursday 00:00 UTC alongside the senior training tick) applies `applyWeeklyGrowth` (base) + `applyYouthCoachCategoryTraining` (category bonus) + `pickNextRevealSkills` (fog reveal). Reveal mechanics run for every youth regardless of assignment.
- Switchable category makes "this week train physical, next week train mental" the whole game — recruits grow into the role the manager cares about.

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
- `libs/database/src/services/training-calculator.ts` — `applyYouthCoachCategoryTraining` distributes a per-player bonus across all skills in a category (even split per skill; respects the existing per-skill upgrade curve).
- `settlement/src/processors/youth-progression.processor.ts` — BullMQ worker for the weekly tick.
- `settlement/src/bootstrap/generators/youth-structure.generator.ts` — idempotent 1:1 creator.
- `api/src/api/scouts/scouts.service.ts` (`selectCandidate`) — player is dropped here with: `position` (from candidate), `potentialAbility` recomputed from `potentialSkills` (NOT a hardcoded 50 anymore), `revealLevel` derived from `revealedSkills.length`.

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Jest for testing
- Conventional commits (commitlint configured)
