# League Module Refactor Summary

## Overview
The League module has been refactored to separate the persistent league definition from season-specific data. This aligns the database schema with the logical structure of the application.

## Changes Implemented

### 1. Database Schema
- **League Table**:
  - Removed `season` column (previously incorrectly defined as integer or varchar depending on context).
  - Added `tier` (integer) - Represents the level of the league in the hierarchy.
  - Added `division` (integer) - Represents the specific division within the tier.
  - `name` and `status` columns remain.

- **LeagueStanding Table**:
  - Added `season` (integer) - Tracks which season the standing record belongs to.
  - Contains performance stats: `points`, `wins`, `draws`, `losses`, `goalsFor`, `goalsAgainst`.

### 2. API Layer
- **LeagueService**:
  - Updated creation and update logic to handle `tier` and `division`.
  - Removed `season` handling from League operations.
- **DTOs**:
  - Updated `CreateLeagueReqDto`, `UpdateLeagueReqDto`, and `LeagueResDto` to reflect schema changes.

### 3. Data Seeding
- **Development Seeder (`pnpm dev:seed`)**:
  - Creates a "Premier Development League" (Tier 1, Division 1).
  - Creates 5 test users with teams assigned to this league.
  - Creates initial `LeagueStanding` records for Season 1 for all teams.
  - Generates ~17 players per team with realistic attributes.

## Verification
- **Migration**: `RefactorLeagueSchema` was successfully generated and applied.
- **Seeding**: `pnpm dev:seed` runs successfully and populates the database with valid data.

## Next Steps
- Implement the Match Engine to utilize the `LeagueStanding` table for updating stats after matches.
- Implement promotion/relegation logic based on `tier` and `division`.
