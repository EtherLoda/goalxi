# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GoalXI is a football manager game with real-time match simulation, team management, transfer market, and league competitions. It's a monorepo with pnpm workspaces containing NestJS microservices and a Next.js frontend.

## Tech Stack

- **Backend**: NestJS 10/11 with TypeORM, PostgreSQL, Redis, BullMQ
- **Frontend**: Next.js 16.0.4 (App Router), React 19.2.0, TailwindCSS 4
- **Package Manager**: pnpm 9.12.3
- **Language**: TypeScript 5.6+

## Project Structure

```
GoalXI/
├── api/           # Main API service (port 3000)
├── simulator/     # Match simulation microservice
├── settlement/    # Financial settlement microservice
├── frontend/      # Next.js frontend (port 8000)
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

### Frontend (frontend/)
```bash
cd frontend
pnpm dev                # Next.js dev server on port 8000
pnpm build              # Production build
pnpm lint               # ESLint
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
- **Frontend client**: `frontend/lib/api.ts` - Centralized fetch wrapper
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

Community forum lives at `api/src/api/forum/` and `frontend/app/forum/`. Entities in `libs/database/src/entities/forum/`:
- `ForumCategoryEntity` - Read-only seeded categories (announcements, general, tactics, transfer-market)
- `ForumThreadEntity` - Thread with title, body, replyCount, hotScore
- `ForumPostEntity` - Reply on a thread
- `ForumReactionEntity` - Like-only reactions (`type='like'`)

**MVP scope**: No category creation (seeded only), no edits (delete + repost), no Markdown, no view count, no moderator system. See `C:\Users\Administrator\.claude\plans\robust-exploring-meerkat.md` for the deferred P1+ work.

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Jest for testing
- Conventional commits (commitlint configured)
