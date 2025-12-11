# GoalXI Database Schema

This document describes the current database schema for the GoalXI football manager game.

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
- One-to-One with `Team`

---
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Note**: Age is calculated from `birthday` field. Season length is 16 weeks = 1 year (configured in settings).

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
  "current": {
    "physical": {
      "pace": 15.50,        // 速度 (0-20)
      "strength": 12.30     // 强壮 (0-20)
    },
    "technical": {
      "finishing": 13.20,   // 射术 (0-20)
      "passing": 16.40,     // 传球 (0-20)
      "dribbling": 15.10,   // 盘带 (0-20)
      "defending": 8.50     // 防守 (0-20)
    },
    "mental": {
      "positioning": 13.90, // 跑位 (0-20)
      "composure": 15.30    // 决断 (0-20)
    }
  },
  "potential": {
    "physical": {
      "pace": 18.00,
      "strength": 15.00
    },
    "technical": {
      "finishing": 17.00,
      "passing": 19.00,
      "dribbling": 18.00,
      "defending": 10.00
    },
    "mental": {
      "positioning": 16.00,
      "composure": 18.00
    }
  }
}
```

For **Goalkeepers** (`is_goalkeeper = true`):

```json
{
  "current": {
    "physical": {
      "pace": 8.50,         // 速度 (0-20)
      "strength": 12.30     // 强壮 (0-20)
    },
    "technical": {
      "reflexes": 17.20,    // 反应 (0-20)
      "handling": 16.50,    // 手控 (0-20)
      "distribution": 13.40 // 出球 (0-20)
    },
    "mental": {
      "positioning": 15.80, // 站位 (0-20)
      "composure": 16.20    // 决断 (0-20)
    }
  },
  "potential": {
    "physical": {
      "pace": 10.00,
      "strength": 15.00
    },
    "technical": {
      "reflexes": 19.00,
      "handling": 19.00,
      "distribution": 16.00
    },
    "mental": {
      "positioning": 18.00,
      "composure": 19.00
    }
  }
}
```

**Note**: Stamina is now a separate field (not in attributes). Form and stamina are both float values (1.0-5.0).

**Note**:

- All attribute values are stored as decimals (0.00-20.00) with 2 decimal precision
- **API Response**: Attributes are automatically rounded to integers (0-20) for display via Transform decorator
- **Database Storage**: Attributes remain as floats for precise calculations
- OVR (Overall Rating) is calculated dynamically based on position and attributes
- Experience is stored as float and displayed with 1 decimal place
- Form is an integer (1-10) representing current player condition

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

### League Table (Implemented)

Represents a competition/league.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique league identifier |
| `name` | VARCHAR | NOT NULL | League name (e.g., "Premier League") |
| `season` | VARCHAR | NOT NULL | Season identifier (e.g., "2024-25") |
| `status` | VARCHAR | DEFAULT 'active' | active, completed |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |
| `deleted_at` | TIMESTAMPTZ | NULLABLE | Soft delete timestamp |

**Relations:**

- One-to-Many with `Team`
- One-to-Many with `Match`

**Notes:**

- Season is stored as VARCHAR to support formats like "2024-25" or "Season 1"
- Status tracks whether league is currently active or has completed

---

### Team Table (Implemented)

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
- One-to-One with `Finance`
- One-to-Many with `Transaction`
- One-to-Many with `Auction` (as seller)
- One-to-Many with `Match` (as home_team)
- One-to-Many with `Match` (as away_team)

---

### Finance Table (Implemented)

Stores the current financial state of a team.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier |
| `team_id` | UUID | FOREIGN KEY, UNIQUE, NOT NULL | Reference to Team (one-to-one) |
| `balance` | INTEGER | DEFAULT 100000 | Current available funds |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Last update timestamp |

**Relations:**

- One-to-One with `Team`

---

#### Transaction Table (Implemented)

Records individual financial events for detailed tracking and statistics.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique identifier |
| `team_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Team |
| `season` | INTEGER | NOT NULL | Season number (1, 2, 3...) |
| `amount` | INTEGER | NOT NULL | Transaction amount (+ for income, - for expense) |
| `type` | VARCHAR | NOT NULL | Category (e.g., 'MATCH_INCOME', 'TRANSFER_IN', 'TRANSFER_OUT', 'WAGES', 'SPONSORSHIP') |
| `created_at` | TIMESTAMPTZ | NOT NULL | When the transaction occurred |

**Relations:**

- Many-to-One with `Team`

**Notes:**

- Positive amounts = income, Negative amounts = expenses
- Season-based statistics can be calculated by grouping transactions
- Type enum: MATCH_INCOME, TRANSFER_IN, TRANSFER_OUT, WAGES, SPONSORSHIP, FACILITY_UPGRADE

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

### Match Table (Implemented)

Represents a football match between two teams.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique match identifier |
| `league_id` | UUID | FOREIGN KEY, NOT NULL | Reference to League |
| `home_team_id` | UUID | FOREIGN KEY, NOT NULL | Home team |
| `away_team_id` | UUID | FOREIGN KEY, NOT NULL | Away team |
| `season` | INTEGER | NOT NULL | Season number |
| `week` | INTEGER | NOT NULL | Match week number |
| `home_score` | INTEGER | DEFAULT 0 | Home team score |
| `away_score` | INTEGER | DEFAULT 0 | Away team score |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL | When match is scheduled to start |
| `simulation_completed_at` | TIMESTAMPTZ | NULLABLE | When simulation finished |
| `status` | VARCHAR | DEFAULT 'SCHEDULED' | SCHEDULED, TACTICS_LOCKED, IN_PROGRESS, COMPLETED, CANCELLED |
| `type` | VARCHAR | DEFAULT 'LEAGUE' | LEAGUE, CUP, FRIENDLY, TOURNAMENT |
| `tactics_locked` | BOOLEAN | DEFAULT FALSE | Whether tactics can no longer be modified |
| `home_forfeit` | BOOLEAN | DEFAULT FALSE | Whether home team forfeited |
| `away_forfeit` | BOOLEAN | DEFAULT FALSE | Whether away team forfeited |
| `has_extra_time` | BOOLEAN | DEFAULT FALSE | Whether match can go to extra time |
| `has_penalty_shootout` | BOOLEAN | DEFAULT FALSE | Whether match can go to penalties |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**

- Many-to-One with `League`
- Many-to-One with `Team` (home_team_id)
- Many-to-One with `Team` (away_team_id)
- One-to-Many with `MatchEvent`
- One-to-Many with `MatchTactics`
- One-to-Many with `MatchTeamStats`

---

### MatchEvent Table (Implemented)

Tracks events that occurred during a match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique event identifier |
| `match_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Match |
| `team_id` | UUID | FOREIGN KEY, NULLABLE | Team involved |
| `player_id` | UUID | FOREIGN KEY, NULLABLE | Player involved |
| `related_player_id` | UUID | FOREIGN KEY, NULLABLE | Secondary player (e.g., assist provider, player substituted out) |
| `type` | VARCHAR | NOT NULL | GOAL, ASSIST, YELLOW_CARD, RED_CARD, SUBSTITUTION, INJURY, FOUL, SHOT, SAVE, OFF_TARGET, PENALTY_GOAL, PENALTY_MISS, OWN_GOAL, VAR_CHECK, HALF_TIME, FULL_TIME, EXTRA_TIME_START, EXTRA_TIME_END, PENALTY_SHOOTOUT_START, PENALTY_SHOOTOUT_END, FORFEIT |
| `type_name` | VARCHAR | NOT NULL | Human readable event type |
| `minute` | INTEGER | NOT NULL | Minute when event occurred |
| `second` | INTEGER | DEFAULT 0 | Second when event occurred |
| `data` | JSONB | NULLABLE | Additional event data |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |

**Relations:**

- Many-to-One with `Match`
- Many-to-One with `Team`
- Many-to-One with `Player`

---

### MatchTactics Table (Implemented)

Stores tactics submitted by a team for a specific match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique tactics identifier |
| `match_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Match |
| `team_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Team |
| `preset_id` | UUID | FOREIGN KEY, NULLABLE | Reference to TacticsPreset used |
| `formation` | VARCHAR | NOT NULL | Formation string (e.g., "4-4-2") |
| `lineup` | JSONB | NOT NULL | Array of player positions and instructions |
| `substitutions` | JSONB | NULLABLE | Planned substitutions |
| `instructions` | JSONB | NULLABLE | Team instructions |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | When tactics were submitted |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**

- Many-to-One with `Match`
- Many-to-One with `Team`
- Many-to-One with `TacticsPreset`

---

### TacticsPreset Table (Implemented)

Stores reusable tactical setups for a team.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique preset identifier |
| `team_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Team |
| `name` | VARCHAR | NOT NULL | Preset name |
| `formation` | VARCHAR | NOT NULL | Formation string |
| `lineup` | JSONB | NOT NULL | Default lineup configuration |
| `substitutions` | JSONB | NULLABLE | Default substitutions |
| `instructions` | JSONB | NULLABLE | Default instructions |
| `is_default` | BOOLEAN | DEFAULT FALSE | Whether this is the default preset |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | Record last update timestamp |

**Relations:**

- Many-to-One with `Team`

---

### MatchTeamStats Table (Implemented)

Stores aggregated statistics for a team in a match.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY | Unique stats identifier |
| `match_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Match |
| `team_id` | UUID | FOREIGN KEY, NOT NULL | Reference to Team |
| `possession` | INTEGER | DEFAULT 0 | Possession percentage (0-100) |
| `shots` | INTEGER | DEFAULT 0 | Total shots |
| `shots_on_target` | INTEGER | DEFAULT 0 | Shots on target |
| `passes` | INTEGER | DEFAULT 0 | Total passes |
| `pass_accuracy` | FLOAT | DEFAULT 0 | Pass completion percentage |
| `tackles` | INTEGER | DEFAULT 0 | Total tackles |
| `fouls` | INTEGER | DEFAULT 0 | Total fouls committed |
| `corners` | INTEGER | DEFAULT 0 | Total corners won |
| `offsides` | INTEGER | DEFAULT 0 | Total offsides |
| `yellow_cards` | INTEGER | DEFAULT 0 | Total yellow cards |
| `red_cards` | INTEGER | DEFAULT 0 | Total red cards |
| `created_at` | TIMESTAMPTZ | NOT NULL | Record creation timestamp |

**Relations:**

- Many-to-One with `Match`
- Many-to-One with `Team`

---

### LeagueStanding Table (New)

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
└── 1:1 → Team

Team
├── 1:1 → Finance
├── N:1 → League
├── 1:N → Player
├── 1:N → Transaction
├── 1:N → Auction (as seller)
├── 1:N → Auction (as current_bidder)
├── 1:N → PlayerTransaction (from_team)
├── 1:N → PlayerTransaction (to_team)
├── 1:N → Match (as home_team)
├── 1:N → Match (as away_team)
├── 1:N → MatchTactics
├── 1:N → TacticsPreset
├── 1:N → MatchTeamStats
└── 1:N → LeagueStanding

Finance
└── 1:1 → Team

Transaction
└── N:1 → Team

Player
├── N:1 → Team
├── 1:N → Auction
├── 1:N → PlayerTransaction
├── 1:N → PlayerHistory
└── 1:N → MatchEvent

Auction
├── N:1 → Player
├── N:1 → Team (seller)
└── N:1 → Team (current_bidder)

PlayerHistory
└── N:1 → Player

PlayerTransaction
├── N:1 → Player
├── N:1 → Team (from_team)
├── N:1 → Team (to_team)
└── N:1 → Auction

Match
├── N:1 → League
├── N:1 → Team (home_team)
├── N:1 → Team (away_team)
├── 1:N → MatchEvent
├── 1:N → MatchTactics
└── 1:N → MatchTeamStats

MatchTactics
├── N:1 → Match
├── N:1 → Team
└── N:1 → TacticsPreset

MatchEvent
├── N:1 → Match
├── N:1 → Team
└── N:1 → Player

League
├── 1:N → Team
├── 1:N → Match
└── 1:N → LeagueStanding
```

---

## Implementation Status

- ✅ **Implemented**: User, Player, Session, Team, League, Finance, Transaction, Auction, PlayerHistory, Transfer, Match, MatchEvent, MatchTactics, TacticsPreset, MatchTeamStats
- 🔄 **In Progress**: None
- 📋 **Planned**: LeagueStanding

---

## Notes

- All tables use UUID for primary keys
- All tables include `created_at` and `updated_at` timestamps
- Most tables support soft deletes via `deleted_at`
- All foreign keys should have indexes for performance
- Player attributes range from 0.00-20.00 (stored as decimals, displayed as integers)
- Currency and financial values are stored as integers (no decimals)
- Seasons are represented as integers (1, 2, 3...) for simplicity
- Auction system uses JSONB for bid history to maintain complete audit trail
- Transaction types are enum-based for consistency
- Match simulation events are stored in `MatchEvent` for replayability
- Player career stats are updated in `Player` entity JSONB column

---

**Last Updated**: 2025-12-05
**Version**: 2.2.0
