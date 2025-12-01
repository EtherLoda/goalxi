# Implementation Plan - League Module Refactor

## Goal
Refactor the League module to align with the new schema requirements: separating the persistent League definition from season-specific data. The League table will define the competition structure (tier, division), while a new/updated LeagueStanding table will track team performance per season.

## User Review Required
> [!IMPORTANT]
> **Breaking Change**: The `season` column will be removed from the `league` table. Any existing league data relying on this column will need to be migrated or re-seeded.
> **New Schema**:
> - `League`: `name`, `tier`, `division` (No season)
> - `LeagueStanding`: `league_id`, `team_id`, `season` (int), `stats...`

## Proposed Changes

### Database Schema
#### [MODIFY] [league.entity.ts](file:///c:/Code/Project/GoalXI/libs/database/src/entities/league.entity.ts)
- Remove `season` column
- Add `tier` (int)
- Add `division` (int)

#### [MODIFY] [league-standing.entity.ts](file:///c:/Code/Project/GoalXI/libs/database/src/entities/league-standing.entity.ts)
- Add `season` (int) column
- Ensure all stats columns are present (`wins`, `draws`, `losses`, `goalsFor`, `goalsAgainst`)

### Migrations
#### [NEW] `RefactorLeagueSchema`
- Drop `season` from `league`
- Add `tier`, `division` to `league`
- Add `season` to `league_standing`

### API Layer
#### [MODIFY] [league.service.ts](file:///c:/Code/Project/GoalXI/api/src/api/league/league.service.ts)
- Update creation logic to include tier/division
- Update retrieval logic

#### [MODIFY] [league.controller.ts](file:///c:/Code/Project/GoalXI/api/src/api/league/league.controller.ts)
- Update DTOs and endpoints

### Seeding
#### [MODIFY] [seed-dev-data.ts](file:///c:/Code/Project/GoalXI/api/scripts/seed-dev-data.ts)
- Update to seed League with tier/division
- Create initial LeagueStanding records for the current season

## Verification Plan
### Automated Tests
- Run `pnpm test` to ensure no regressions
- Run `pnpm dev:seed` to verify seeding works with new schema

### Manual Verification
- Check database schema using `psql` or `typeorm` CLI
- Verify API endpoints for League
