# Mini-FC Database Schema

This document describes the current database schema for the Mini-FC football manager game.

## Current Schema (Implemented)

### User Table
Represents a football manager/user account.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique user identifier |
| `username` | VARCHAR(50) | UNIQUE, NULLABLE | User's username |
| `email` | VARCHAR | UNIQUE, NOT NULL | User's email address |
| `password` | VARCHAR | NOT NULL | Hashed password |
| `bio` | VARCHAR | DEFAULT '' | User biography |
| `nickname` | VARCHAR(50) | NULLABLE | Display nickname (alternative to username) |
| `avatar` | VARCHAR | DEFAULT '' | Avatar image URL or identifier |
| `supporter_level` | INTEGER | DEFAULT 0 | Supporter tier (0=no, 1=tier1, 2=tier2, 3=tier3) |
| `created_by` | VARCHAR | | User who created this record |
| `updated_by` | VARCHAR | | User who last updated this record |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Indexes:**
- `UQ_user_username` - Unique index on username (where deleted_at IS NULL)
- `UQ_user_email` - Unique index on email (where deleted_at IS NULL)

**Relations:**
- One-to-Many with `Session` (user sessions)

---

### Player Table
Represents a football player with comprehensive attributes.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique player identifier |
| `team_id` | UUID | FOREIGN KEY, NULLABLE | Reference to Team (Many-to-One) |
| `name` | VARCHAR | NOT NULL | Player's full name |
| `birthday` | DATE | NULLABLE | Player's date of birth |
| `appearance` | JSONB | NOT NULL | Player appearance configuration (see structure below) |
| `position` | VARCHAR | NULLABLE | Player position (GK, DEF, MID, FWD) - set by manager |
| `is_goalkeeper` | BOOLEAN | DEFAULT false | Whether this player is a goalkeeper |
| `on_transfer` | BOOLEAN | DEFAULT false | Whether player is on transfer list |
| `attributes` | JSONB | NOT NULL | Player attributes (see structure below) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Appearance Structure (JSONB):**

The appearance object defines the visual characteristics of a player for frontend rendering. All values are integers or booleans to ensure consistent rendering across different clients.

```json
{
  "skinTone": 3,        // Integer 1-6: Player's skin tone
                        // 1=Very Light, 2=Light, 3=Medium Light, 4=Medium, 5=Medium Dark, 6=Dark
  
  "hairStyle": 5,       // Integer 1-10: Hairstyle variant
                        // 1=Bald, 2=Short, 3=Crew Cut, 4=Spiky, 5=Medium, 
                        // 6=Long, 7=Curly, 8=Afro, 9=Ponytail, 10=Dreadlocks
  
  "hairColor": 2,       // Integer 1-8: Hair color
                        // 1=Black, 2=Dark Brown, 3=Brown, 4=Light Brown,
                        // 5=Blonde, 6=Red, 7=Gray, 8=White
  
  "facialHair": 1,      // Integer 0-5: Facial hair style
                        // 0=None, 1=Stubble, 2=Goatee, 3=Full Beard,
                        // 4=Mustache, 5=Soul Patch
  
  "accessories": {
    "headband": false,   // Boolean: Whether player wears a headband
    "wristband": true,   // Boolean: Whether player wears wristbands
    "captainBand": false // Boolean: Whether player wears captain's armband
  }
}
```

**Note**: The frontend MiniPlayer component uses these values to render the pixel art representation. Each value maps to a specific sprite or color in the rendering system.

**Attributes Structure (JSONB):**

For **Outfield Players** (`is_goalkeeper = false`):
```json
{
  "physical": {
    "pace": 15.50,        // 速度 (0-20)
    "strength": 12.30,    // 强壮 (0-20)
    "stamina": 14.80      // 体能 (0-20)
  },
  "technical": {
    "finishing": 13.20,   // 射术 (0-20)
    "passing": 16.40,     // 传球 (0-20)
    "dribbling": 15.10,   // 盘带 (0-20)
    "defending": 8.50     // 防守 (0-20)
  },
  "mental": {
    "vision": 14.70,      // 视野 (0-20)
    "positioning": 13.90, // 跑位 (0-20)
    "awareness": 12.60,   // 防守站位 (0-20)
    "composure": 15.30,   // 决断 (0-20)
    "aggression": 11.20   // 侵略性 (0-20)
  }
}
```

For **Goalkeepers** (`is_goalkeeper = true`):
```json
{
  "physical": {
    "pace": 8.50,         // 速度 (0-20)
    "strength": 12.30,    // 强壮 (0-20)
    "stamina": 14.80      // 体能 (0-20)
  },
  "technical": {
    "reflexes": 17.20,    // 反应 (0-20)
    "handling": 16.50,    // 手控 (0-20)
    "distribution": 13.40 // 出球 (0-20)
  },
  "mental": {
    "vision": 12.10,      // 视野 (0-20)
    "positioning": 15.80, // 站位 (0-20)
    "awareness": 14.30,   // 意识 (0-20)
    "composure": 16.20,   // 决断 (0-20)
    "aggression": 9.50    // 侵略性 (0-20)
  }
}
```

**Note**: 
- All attribute values are stored as decimals (0.00-20.00) with 2 decimal precision
- Players see rounded integer values (0-20) in the UI
- OVR (Overall Rating) is calculated dynamically based on position and attributes
- Player appearance (skin tone, hair, accessories) is generated client-side based on player ID

**Indexes:**
- Primary key on `id`
- Foreign key on `team_id`

**Relations:**
- Many-to-One with `Team`

---

### Session Table
Stores user authentication sessions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique session identifier |
| `user_id` | UUID | FOREIGN KEY, NOT NULL | Reference to User |
| `hash` | VARCHAR | NOT NULL | Session hash/token |
| `created_at` | TIMESTAMPTZ | NOT NULL | Session creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Session last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Relations:**
- Many-to-One with `User` (user.id)

---

## Planned Schema Enhancements

### Phase 1: MVP Enhancements

#### Player Table - Proposed Additions
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | UUID | FOREIGN KEY, NULLABLE | Owner/manager of the player |
| `overall_rating` | INTEGER | COMPUTED | Average of speed, power, skill |
| `market_value` | INTEGER | DEFAULT 10000 | Player's market value |
| `contract_expiry` | DATE | NULLABLE | When contract ends |
| `morale` | INTEGER | DEFAULT 75 | Player happiness (1-100) |
| `injury_status` | VARCHAR | DEFAULT 'fit' | fit, minor_injury, major_injury |
| `stamina` | INTEGER | DEFAULT 100 | Energy level (0-100) |

**New Relations:**
- Many-to-One with `User` (user.id)

---

### Phase 2: Core Gameplay

#### ManagerFinance Table (New)
Stores financial data for each manager (separate from User table).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier |
| `user_id` | UUID | FOREIGN KEY, UNIQUE, NOT NULL | Reference to User (one-to-one) |
| `currency` | INTEGER | DEFAULT 100000 | In-game money/budget |
| `total_earned` | INTEGER | DEFAULT 0 | Total currency earned all-time |
| `total_spent` | INTEGER | DEFAULT 0 | Total currency spent all-time |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**
- One-to-One with `User` (user.id)

---

#### League Table (New)
Represents a competition/league.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique league identifier |
| `name` | VARCHAR | NOT NULL | League name (e.g., "Premier League") |
| `season` | INTEGER | NOT NULL | Season number (1, 2, 3...) |
| `status` | VARCHAR | DEFAULT 'active' | active, completed |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**
- One-to-Many with `Team`
- One-to-Many with `LeagueStanding`

---

#### Team Table (New)
Represents a football team owned by a manager.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique team identifier |
| `user_id` | UUID | FOREIGN KEY, UNIQUE, NOT NULL | Manager/owner of the team (one-to-one) |
| `league_id` | UUID | FOREIGN KEY, NULLABLE | Current league |
| `name` | VARCHAR | NOT NULL | Team name |
| `logo_url` | VARCHAR | DEFAULT '' | Team logo image URL |
| `jersey_color_primary` | VARCHAR | DEFAULT '#FF0000' | Primary jersey color (hex) |
| `jersey_color_secondary` | VARCHAR | DEFAULT '#FFFFFF' | Secondary jersey color (hex) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Indexes:**
- `IDX_team_league` - Index on league_id

**Relations:**
- One-to-One with `User`
- Many-to-One with `League`
- One-to-Many with `Player`
- One-to-Many with `Match` (as home_team)
- One-to-Many with `Match` (as away_team)

---

#### Match Table (New)
Represents a football match between two teams.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique match identifier |
| `home_team_id` | UUID | FOREIGN KEY, NOT NULL | Home team |
| `away_team_id` | UUID | FOREIGN KEY, NOT NULL | Away team |
| `home_score` | INTEGER | DEFAULT 0 | Home team score |
| `away_score` | INTEGER | DEFAULT 0 | Away team score |
| `match_date` | TIMESTAMPTZ | NOT NULL | When match was/will be played |
| `status` | VARCHAR | DEFAULT 'scheduled' | scheduled, in_progress, completed |
| `match_type` | VARCHAR | DEFAULT 'league' | league, cup, friendly |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**
- Many-to-One with `Team` (home_team_id)
- Many-to-One with `Team` (away_team_id)
- One-to-Many with `MatchEvent`

---

#### MatchEvent Table (New)
Tracks events that occurred during a match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique event identifier |
| `match_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Match |
| `player_id` | UUID | FOREIGN KEY, NOT NULL | Player involved |
| `event_type` | VARCHAR | NOT NULL | goal, assist, yellow_card, red_card, substitution |
| `minute` | INTEGER | NOT NULL | Minute when event occurred (1-90+) |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |

**Relations:**
- Many-to-One with `Match`
- Many-to-One with `Player`

---

### Phase 3: Advanced Features

#### Transfer Table (New)
Tracks player transfers between teams.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique transfer identifier |
| `player_id` | UUID | FOREIGN KEY, NOT NULL | Player being transferred |
| `from_team_id` | UUID | FOREIGN KEY, NULLABLE | Previous team (null for new players) |
| `to_team_id` | UUID | FOREIGN KEY, NOT NULL | New team |
| `transfer_fee` | INTEGER | NOT NULL | Amount paid |
| `transfer_date` | DATE | DEFAULT NOW() | When transfer occurred |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |

**Relations:**
- Many-to-One with `Player`
- Many-to-One with `Team` (from_team_id)
- Many-to-One with `Team` (to_team_id)

---

#### LeagueStanding Table (New)
Tracks team positions in a league.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier |
| `league_id` | UUID | FOREIGN KEY, NOT NULL | Reference to League |
| `team_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Team |
| `position` | INTEGER | NOT NULL | Current rank (1, 2, 3...) |
| `points` | INTEGER | DEFAULT 0 | Total points |
| `wins` | INTEGER | DEFAULT 0 | Total wins |
| `draws` | INTEGER | DEFAULT 0 | Total draws |
| `losses` | INTEGER | DEFAULT 0 | Total losses |
| `goals_for` | INTEGER | DEFAULT 0 | Goals scored |
| `goals_against` | INTEGER | DEFAULT 0 | Goals conceded |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Unique Constraints:**
- `UQ_league_team` - Unique (league_id, team_id)

**Relations:**
- Many-to-One with `League`
- Many-to-One with `Team`

---

## Entity Relationship Diagram (ERD)

```
User (Manager)
├── 1:N → Session
├── 1:1 → ManagerFinance
├── 1:1 → Team
└── 1:N → Player (optional direct ownership)

ManagerFinance
└── 1:1 → User

Team
├── N:1 → League
├── 1:N → Player
├── 1:N → Match (as home_team)
├── 1:N → Match (as away_team)
├── 1:N → Transfer (from_team)
├── 1:N → Transfer (to_team)
└── 1:N → LeagueStanding

Player
├── N:1 → Team
├── 1:N → MatchEvent
└── 1:N → Transfer

Match
├── N:1 → Team (home_team)
├── N:1 → Team (away_team)
└── 1:N → MatchEvent

League
├── 1:N → Team
└── 1:N → LeagueStanding
```

---

## Implementation Status

- ✅ **Implemented**: User (enhanced), Player, Session
- 🔄 **In Progress**: None
- 📋 **Planned**: ManagerFinance, League, Team, Match, MatchEvent, Transfer, LeagueStanding

---

## Notes

- All tables use UUID for primary keys
- All tables include `created_at` and `updated_at` timestamps
- Most tables support soft deletes via `deleted_at`
- All foreign keys should have indexes for performance
- Player stats (speed, power, skill) range from 1-99
- Currency and market values are stored as integers (no decimals)

---

**Last Updated**: 2025-11-27
**Version**: 1.1.0
