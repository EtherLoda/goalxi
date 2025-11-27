# User Schema Enhancement Summary

## Changes Made

### Entity Updates (`user.entity.ts`)

Added the following fields to the `UserEntity`:

```typescript
// Football Manager specific fields
@Column({ name: 'nickname', length: 50, nullable: true })
nickname?: string;

@Column({ name: 'avatar', default: '' })
avatar?: string;

@Column({ name: 'supporter_level', type: 'int', default: 0 })
supporterLevel: number; // 0 = no, 1 = tier1, 2 = tier2, 3 = tier3

@Column({ name: 'team_name', default: 'My Team' })
teamName: string;

@Column({ name: 'currency', type: 'int', default: 100000 })
currency: number;

@Column({ name: 'level', type: 'int', default: 1 })
level: number;
```

### DTO Updates (`user.res.dto.ts`)

Added corresponding fields to the response DTO:

- `nickname?: string` - Display nickname (optional)
- `avatar: string` - Avatar image URL or identifier
- `supporterLevel: number` - Supporter tier (0-3)
- `teamName: string` - Manager's team name
- `currency: number` - In-game money/budget
- `level: number` - Manager level/experience

### Database Migration

Created migration: `1732677262000-AddFootballManagerFieldsToUser.ts`

**Migration adds:**
- `nickname` VARCHAR(50) NULLABLE
- `avatar` VARCHAR NOT NULL DEFAULT ''
- `supporter_level` INTEGER NOT NULL DEFAULT 0
- `team_name` VARCHAR NOT NULL DEFAULT 'My Team'
- `currency` INTEGER NOT NULL DEFAULT 100000
- `level` INTEGER NOT NULL DEFAULT 1

## Field Descriptions

### nickname
- **Type**: VARCHAR(50), nullable
- **Purpose**: Alternative display name for the user
- **Use Case**: Players can choose a nickname different from their username

### avatar
- **Type**: VARCHAR, default ''
- **Purpose**: Store avatar image URL or identifier
- **Use Case**: Profile customization, can link to uploaded image or avatar service

### supporterLevel
- **Type**: INTEGER, default 0
- **Purpose**: Supporter/premium tier system
- **Values**:
  - `0` = No supporter status (free tier)
  - `1` = Tier 1 supporter
  - `2` = Tier 2 supporter
  - `3` = Tier 3 supporter
- **Use Case**: Unlock premium features, cosmetics, or bonuses based on tier

### teamName
- **Type**: VARCHAR, default 'My Team'
- **Purpose**: Name of the manager's football team
- **Use Case**: Display in matches, league tables, and team management

### currency
- **Type**: INTEGER, default 100000
- **Purpose**: In-game money/budget
- **Use Case**: Buy players, upgrade facilities, pay salaries

### level
- **Type**: INTEGER, default 1
- **Purpose**: Manager experience level
- **Use Case**: Unlock features, show progression, matchmaking

## Next Steps

1. **Run Migration**: When Docker is running, execute:
   ```bash
   npm run migration:up
   ```

2. **Update User Service**: Add logic to handle new fields in user creation/update

3. **Frontend Integration**: Update user profile UI to display and edit these fields

4. **Game Logic**: Implement:
   - Currency earning/spending system
   - Level progression mechanics
   - Supporter tier benefits
   - Avatar upload/selection

## API Impact

The `/api/users/me` endpoint will now return:

```json
{
  "id": "uuid",
  "username": "player123",
  "email": "player@example.com",
  "bio": "Football enthusiast",
  "image": "https://...",
  "nickname": "The Boss",
  "avatar": "https://...",
  "supporterLevel": 2,
  "teamName": "FC Champions",
  "currency": 150000,
  "level": 5,
  "createdAt": "2025-11-27T...",
  "updatedAt": "2025-11-27T..."
}
```

---

**Date**: 2025-11-27
**Status**: ✅ Completed
