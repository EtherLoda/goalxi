# Database Migrations Summary

This document provides an overview of all database migrations in the GoalXI project.

## Migration History

### 1. **InitialSchema** (1764595173536)

- **File**: `1764595173536-InitialSchema.ts`
- **Purpose**: Creates the initial database schema
- **Tables Created**: Core tables for users, teams, leagues, matches, players, etc.

### 2. **AddPlayerPotentialSystem** (1764604874470)

- **File**: `1764604874470-AddPlayerPotentialSystem.ts`
- **Purpose**: Adds player potential ability system
- **Changes**:
  - Adds potential-related columns to player table
  - Enables tracking of player growth potential

### 3. **UpdatePlayerFormAndStamina** (1764647470138)

- **File**: `1764647470138-UpdatePlayerFormAndStamina.ts`
- **Purpose**: Updates player form and stamina tracking
- **Changes**:
  - Modifies form and stamina columns
  - Improves player condition tracking

### 4. **RefactorPlayerSkills** (1733148638000)

- **File**: `1733148638000-RefactorPlayerSkills.ts`
- **Purpose**: Refactors the player skills system
- **Changes**:
  - Restructures how player skills are stored
  - Improves skill data organization

### 5. **UpdatePlayerBirthdayType** (1733149600000)

- **File**: `1733149600000-UpdatePlayerBirthdayType.ts`
- **Purpose**: Updates player birthday field type
- **Changes**:
  - Changes birthday column data type
  - Ensures proper date handling

### 6. **RemovePlayerPosition** (1733150000000)

- **File**: `1733150000000-RemovePlayerPosition.ts`
- **Purpose**: Removes old player position field
- **Changes**:
  - Removes deprecated position column
  - Part of position system refactoring

### 7. **CreateMatchTables** (1733230000000)

- **File**: `1733230000000-CreateMatchTables.ts`
- **Purpose**: Creates match-related tables
- **Changes**:
  - Adds tables for match events, stats, tactics
  - Enables match simulation system

### 8. **AllowMultipleTeamsPerUser** (1733241000000)

- **File**: `1733241000000-AllowMultipleTeamsPerUser.ts`
- **Purpose**: Allows users to have multiple teams
- **Changes**:
  - Modifies user-team relationship
  - Enables multi-team management

### 9. **AddDatabaseIndexes** (1764900000000)

- **File**: `1764900000000-AddDatabaseIndexes.ts` (if exists)
- **Purpose**: Adds database indexes for performance
- **Changes**:
  - Creates indexes on frequently queried columns
  - Improves query performance

### 10. **AddAuctionExpiresAt** (1734592800000) ✨ **NEW**

- **File**: `1734592800000-AddAuctionExpiresAt.ts`
- **Purpose**: Separates auction expiration time from closing time
- **Changes**:
  - Adds `expires_at` column (auction deadline with extensions)
  - Makes `ends_at` nullable (actual closing time)
  - Migrates existing auction data
  - Enables proper auction extension logic

## Running Migrations

### Apply Pending Migrations

```bash
cd api
pnpm run migration:up
```

### Revert Last Migration

```bash
cd api
pnpm run migration:down
```

### Show Migration Status

```bash
cd api
pnpm run migration:show
```

### Create New Migration

```bash
cd api
pnpm run migration:create src/database/migrations/YourMigrationName
```

### Generate Migration from Entity Changes

```bash
cd api
pnpm run migration:generate src/database/migrations/YourMigrationName
```

## Migration Best Practices

1. **Always test migrations** in development before applying to production
2. **Write reversible migrations** - implement both `up()` and `down()` methods
3. **Backup data** before running migrations on production
4. **Use transactions** for data integrity
5. **Document changes** in migration files with clear comments
6. **Version control** all migration files

## Current Database State

After all migrations have been applied, the database includes:

- ✅ User authentication and session management
- ✅ Team and league management
- ✅ Player system with skills, potential, and form
- ✅ Match simulation with events and statistics
- ✅ Tactics and formation system
- ✅ Transfer market with auction system
- ✅ Finance and transaction tracking
- ✅ Player history and transfer records

## Notes

- Migration timestamps are in Unix epoch format (milliseconds)
- Migrations are executed in chronological order
- The `migrations` table tracks which migrations have been applied
- TypeORM automatically manages migration state
