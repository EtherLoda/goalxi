---
order: 27
slug: rankings
title: Team Rankings
status: full
lastUpdated: 2026-09-02
relatedChapters: [20, 21]
relatedEntries: []
---

# Team Rankings

GoalXI's "rankings" are **only 3 dimensions, all per-league** (no cross-league "national ranking"). **Global team rankings, global top-scorer lists, transfer activity boards, fan rankings** — none of these exist.

This chapter covers **which 3 exist, how to use them, when to check**, and **which don't exist** (so you don't waste time looking).

---

## 1. The 3 that exist + 4 that don't (quick reference)

| Ranking | Exists? | Endpoint | Notes |
|---|---|---|---|
| **League standings** (16 teams per league) | ✅ | `GET /leagues/:id/standings?season=N` | See Chapter 20 |
| **League player board** (goals / assists / tackles) | ✅ | `GET /stats/leaderboard/:leagueId/:type?season=N&limit=10` | Per league, top 10 |
| **Team season stats** (single team aggregate) | ✅ | `GET /stats/teams/:teamId/season/:season` | Not a leaderboard — single team aggregate |
| **Global team ranking** | ❌ | — | Not in MVP |
| **Global scorer / assists / tackles** | ❌ | — | Per-league only, no cross-league rollup |
| **Transfer activity board** | ❌ | — | Not in MVP |
| **Fan ranking** | ❌ | — | Only `GET /teams/:teamId/fans` (per team), no leaderboard |

> **MVP focus**: you can only compare **within your own league**, **not** across leagues. There's no "which L1 team is strongest" or "top scorer across L1-L4".

---

## 2. League standings (the most-used one)

**Endpoint**: `GET /leagues/:id/standings?season=N` (public, `@Public()`)

**One per league**, season starts at 1, default `season=1`. MVP-stage each league has 16 teams, so **each table is 16 rows**.

### Fields

| Field | Meaning |
|---|---|
| `position` | Rank (1 = top) |
| `teamId` / `teamName` | Team id / name (dynamic join) |
| `played` | Matches played |
| `wins` / `draws` / `losses` | W / D / L counts |
| `goalsFor` | Goals scored |
| `goalsAgainst` | Goals conceded |
| `goalDifference` | Net (goalsFor − goalsAgainst, computed in service) |
| `points` | Points (W = 3, D = 1, L = 0) |
| `recentMatches` | Last 5 matches (W / D / L + score + opponent, **computed on read**) |

### Sort order (DB does it)

```
points (high → low)
   ↓ tied
goalDifference (high → low)
   ↓ tied
goalsFor (high → low)
```

> Goal difference beats goals for — a 5-0 win is better than a 4-0 win (same goals scored, but GD is higher).

### How to read

- **Title race** = top 2, usually decided in the final few weeks
- **Promotion / relegation line** = 9-12 is the playoff band, 13+ is the relegation zone (see Chapter 20)
- **Recent form** = read the `recentMatches` array (W / D / L chained)
- **Opponent** = `teamName` field

### When to check

- **Early season** — once, to see who's in the top flight
- **Mid-season** — 1-2 times / week, watch **points + GD** (decide ties)
- **End of season** — every day, watch 9-12 (the relegation line)
- **Your team** — right after every match, see your position change

---

## 3. Player board (within a league)

**Endpoint**: `GET /stats/leaderboard/:leagueId/:type?season=N&limit=10` (public)

**3 types**:
- `goals` — top scorers
- `assists` — top assists
- `tackles` — top tacklers

### Fields (per entry)

| Field | Meaning |
|---|---|
| `playerId` / `playerName` | Player id / name |
| `teamId` / `teamName` | Team id / name |
| `goals` / `assists` / `tackles` | The relevant stat (sorted by type) |
| `yellowCards` / `redCards` | Card count (reference) |
| `appearances` / `starts` | Appearances / starts |

### Sort

- By the `type` field, descending (more goals > fewer)
- Tiebreaker: `playerId` ascending (stable secondary order, not by name)

### Limits

- **Per league only** — can't see "L1 top scorer" or "all-league combined"
- **Default `limit=10`** — in a 16-team league, the **bottom 6 are not shown**
- **`offset` supported** — pagination for 11-20 etc. (MVP-stage 16 teams, top 10 is enough; offset is API-level, future-proofing)
- **No player avatar / team logo URL** (plain text)

### Vs player detail page

- **Player board** = **this league's** all teams / all players rolled up (ranking)
- **Player detail page** (see Chapter 4) = the player's own full data (league + cup + national team, all seasons)
- **Detail = "personal report"**, **board = "league-wide ranking"**

---

## 4. Single-team season stats (auxiliary)

**Endpoint**: `GET /stats/teams/:teamId/season/:season` (public)

> This is **not a leaderboard**, it's a **single-team season aggregate**. Listed in Chapter 27 because it's also "season stats".

| Field | Meaning |
|---|---|
| `teamId` | Team id |
| `matchesPlayed` | Matches played (only `COMPLETED`) |
| `wins` / `draws` / `losses` | W / D / L |
| `goalsFor` / `goalsAgainst` | Goals scored / conceded |
| `goalDifference` | Net |
| `points` | Points |
| `cleanSheets` | **Clean sheets** (0 goals conceded, GK-friendly) |

> Computed **live** from the `match` table (no cache). **Only `COMPLETED` matches count**; **cup matches don't count** here (only `matchType='LEAGUE'` is aggregated).

---

## 5. Which one when

| What you want | Use |
|---|---|
| My league rank | Standings (check your own `position`) |
| Direct opponents | Standings top 8 |
| League top scorer | `/stats/leaderboard/:leagueId/goals?limit=10` |
| League assist leader | `/stats/leaderboard/:leagueId/assists?limit=10` |
| League top tackler | `/stats/leaderboard/:leagueId/tackles?limit=10` |
| My team's season record | `/stats/teams/:myTeamId/season/N` |
| Who made L1 cup SF | ❌ not available (see cup bracket, Chapter 21) |
| Which L1 team is strongest | ❌ not available (MVP has no cross-league ranking) |
| MVP candidate | ❌ not available (no MVP award) |
| My team's popularity | ❌ not available (fan detail is per-team, no ranking) |

---

## 6. What's NOT in MVP (user demand vs MVP state)

Hattrick has **many rankings**:
- Global team ranking (by ELO)
- Per-country league ranking
- Transfer income ranking
- Fan count ranking
- Historical best record
- etc.

**GoalXI MVP only has the 3 directly tied to the season flow** (standings / player board / single-team stats). The rest **all missing**.

### Future additions (post-MVP)

| Ranking | Priority | Notes |
|---|---|---|
| **Cross-league team ranking** | High | Roll up 85 leagues by ELO / record |
| **Cross-league scorer board** | Med | Same as league scorer, but across all 1360 teams' players |
| **Transfer activity board** | Low | Most-active buyers / sellers, business-oriented |
| **Fan count ranking** | Low | Decorative, doesn't drive game mechanics |
| **Historical best record** | Med | Cross-season query |
| **Player awards** | High | Golden Boot / Assist King / Best GK (league + cup) |

> These are **not in MVP scope** today. Player demand → re-prioritize.

---

## 7. How this connects to other concepts

| Concept | Connection |
|---|---|
| **League** (Chapter 20) | Standings are the league's core display |
| **Cup** (Chapter 21) | Cup has **no** ranking (single elim), but the bracket is a "tree" |
| **Player** (Chapter 4) | Detail page = personal report; player board = league-wide ranking |
| **Transfer** (Chapter 18) | Player board **doesn't** highlight "just transferred" players |
| **Specialty** (Chapter 4) | Player board **doesn't** break down by specialty (league-wide rollup, no specialty filter) |
| **Youth** (Chapter 19) | Youth players **can** appear on the board (if they play league matches) |

---

## 8. Can / can't do

### ✅ Can

- View your league's standings (any time)
- View your league's player board (goals / assists / tackles, top 10)
- View your team's season aggregate
- View historical-season standings (`?season=N`)

### ❌ Can't (MVP)

- **Cross-league ranking** — can't see "L1 strongest team"
- **Cross-league player board** — can't see "L1 + L2 + L3 + L4 top scorer"
- **Team page shows "your cross-league position"** — doesn't exist
- **Fan-count ranking** — doesn't exist
- **Player awards** — Golden Boot / Assist King etc. are **not** standalone awards; just a `GOLDEN_BOOT` event on the player page (see Chapter 4)
- **Future-season prediction** — doesn't exist
- **Team history rollup** — MVP doesn't aggregate (current season only)

### ❌ FE limits (also MVP)

- Player board **only shows top 10**, the bottom 6 (in a 16-team league) **are hidden**
- Player board has **no avatar** (plain text)
- Team data has **no chart** (no goals trend, no W/L curve)
- Cross-season filter **is supported** (`?season=N`), but **cross-league filter is not**

---

## 9. Common mistakes (about rankings)

❌ **"Standings = champions list"**: standings only reflect **current season**, no cross-season; **champion = L1 league champion + National Cup champion**, not "standings regular"
❌ **"Player board top 10 = all players"**: default `limit=10`, the **bottom 6** (in a 16-team league) **are not shown**; offset to paginate
❌ **"I can see L1 players"**: you can't. **Only your own league** (and your own team, your own player)
❌ **"Player board is cross-league"**: **no**, each league has its own independent board
❌ **"cleanSheets = GK rating"**: cleanSheets is a **count** (matches without conceding), not a rating; GK ratings have **no** public board
❌ **"Goals = team goals"**: the player board is **individual player** goals, **not** team; team goals come from the single-team stats
❌ **"I can buy / sell from the leaderboard"**: leaderboard is **read-only**, you can't operate players through it (transfers are via Chapter 18)
❌ **"Fan board affects wages"**: **no fan board**, wages don't move with ranking
❌ **"Golden Boot = MVP"**: MVP-stage has **no** Golden Boot, **no** MVP award; only a `GOLDEN_BOOT` event on the player page (see Chapter 4 + `player-event-types` FAQ)

---

## 10. Practical flow (manager view)

### Weekly check rhythm

| Day | What | How often |
|---|---|---|
| **Mon** | Player board (spot new stars) | 1× / week |
| **Wed** | Your league standings (just played) | After every league match |
| **Fri** | Player board (goals / assists) | 1× / week |
| **End of season** | Standings top 8 + 9-12 | Daily |

### How to use the player board

- **Scout / buy** — check the other league's player board, target **top scorers / assisters** (see Chapter 18 `comparing-two-players`)
- **Tactics** — your team's **top assist** = the playmaker, **don't sell**; **top tackler** = midfield wall, **don't sell**
- **Poach** — other teams' top-10 players = your targets; check **if you can afford them** (see Chapter 18)

### How to use the standings

- **Top 4** = direct title rivals, **study them hard** (PWI / tactics / form)
- **5-8** = mid-table
- **9-12** = **playoff opponents**, season-end every match matters
- **13+** = your "free wins", beat them for GD (may decide tie-breaker)

### "Scouting via leaderboard"

- **Goals**: opponent's top-3 scorers vs your defenders — who's stronger?
- **Assists**: opponent's top-3 assisters are wings / midfield / which slot? Your counterpart must defend
- **Tackles**: opponent's top tackler = midfield wall — if you can't break through, you lose
- **Clean sheets**: opponent has many clean sheets = solid defense — you need long shots / set pieces to break a parked bus

---

## Next

- [Chapter 4: Player Other Attributes](04-player-attributes.md) — player detail page = personal report
- [Chapter 18: Transfer Market](18-transfer.md) — use player board for targets / sell decisions
- [Chapter 20: League Tier System](20-league-system.md) — full standings walkthrough
- [Chapter 21: Cup System](21-cup-system.md) — cup bracket vs "ranking"
