---
order: 20
slug: league-system
title: League Tier System
status: full
lastUpdated: 2026-09-02
relatedChapters: [21]
relatedEntries: []
---

# League Tier System

GoalXI's leagues form a **4-tier pyramid**, 16 teams per league, totaling **85 leagues / 1360 teams**. Your team is assigned to one of L4-L1 at season start; at season end the standings drive promotion / relegation.

This chapter covers the **pyramid structure, standings, promotion / relegation, season cadence**. The **cup** is in [Chapter 21](21-cup-system.md).

---

## 1. Pyramid structure (4 tiers)

| Tier | Chinese name | Leagues | Divisions | Teams / div | Total teams |
|---|---|---|---|---|---|
| **L1** | China Super League | 1 | div 1 | 16 | 16 |
| **L2** | China First Division | 4 | div 1-4 | 16 | 64 |
| **L3** | China Second Division | 16 | div 1-16 | 16 | 256 |
| **L4** | China Amateur League | 64 | div 1-64 | 16 | 1024 |
| **Total** | | **85** | | | **1360** |

> **Division hierarchy**:
> - All 4 L2 divisions hang off L1 (each L2 = L1's sub-league)
> - L3 div d hangs off L2 div `ceil(d/4)` (4 L3 per L2)
> - L4 div d hangs off L3 div `ceil(d/4)` (4 L4 per L3)
>
> Promotion / relegation **only happens between adjacent tiers** (L1 ↔ L2 / L2 ↔ L3 / L3 ↔ L4).

---

## 2. Season cadence

- **16 weeks per season** (season length = 7 days/week × 16 weeks)
- **League matches on Wed + Sat** cadence, kickoff **6:00 UTC = 14:00 China time**
- **Cup matches on Tue + Thu** (see [Chapter 21](21-cup-system.md))
- **League + cup don't collide**: Mon / Sun are reserved for training / finance / scouting / player growth

> In practice, you play **1-2 league games per week** (depending on schedule density) + cup rounds (if you're still in the cup), and the other days are for **lineup tweaks, training, transfer activity**.

---

## 3. What's in a league

Each league is an independent "season loop" — **not** cross-league.

| Field | Meaning | MVP default |
|---|---|---|
| `name` | League name | "China Super League" / "China First Division Div N" / ... |
| `tier` | 1 = top, 2-4 = descending | 1 / 2 / 3 / 4 |
| `tierDivision` | Division number within the tier | L2: 1-4, L3: 1-16, L4: 1-64 |
| `maxTeams` | Max team count | **16** |
| `parentLeagueId` | Parent league | L4 → L3, L3 → L2, L2 → L1 |
| `status` | League status | `active` / `inactive` |

> **16 teams per league** (home + away double round-robin = 30 matches = **30 games / team / season**).

---

## 4. Promotion / relegation (same shape for every league)

At season end, **top 1 + middle 4 + bottom 4 = 9 positions** are involved:

| Position | Outcome | Notes |
|---|---|---|
| **1st** | **Direct promotion** to the league above | 1 team goes up |
| **2nd-8th** | **Stay** | Stay in the same tier |
| **9th-12th** | **Playoff round** | 4 teams vs the upper league's 9th-12th, **winners go up / stay, losers stay / go down** |
| **13th-16th** | **Direct relegation** to the league below | 4 teams go down |

> **Net flow check**: L1 promotes 1, relegates 4, net outflow 3 — but L1 is the top (no L0), so **L1 doesn't get teams from L0**; the 4 L1-relegated teams slot into L2's 4 promotion spots (the system keeps total count constant).
>
> L2 / L3 / L4 are **balanced flow** — promotion count = relegation count (net 0).

**Promotion / relegation playoff details**:
- 9th-12th vs upper-league 9th-12th, **single-match knockout**
- Format similar to cup (see Chapter 21), **two-leg** (see Chapter 6)
- Tiebreakers: aggregate score / away goals / extra time / penalties (see [Chapter 6](06-match-basics.md))

> **Practical implications**:
> - **Stable 1-8 = stay put** — don't worry
> - **9-12 = playoff** — tense but recoverable
> - **13 and below = direct relegation** — next season in a lower league

---

## 5. League standings

One standings table per league per season, sorted by:

```
points → goal difference → goals for
```

| Field | Meaning |
|---|---|
| `position` | Rank (1 = top) |
| `played` | Matches played |
| `wins` / `draws` / `losses` | W / D / L counts |
| `goalsFor` | Goals scored |
| `goalsAgainst` | Goals conceded |
| `goalDifference` | Net (goalsFor − goalsAgainst) — **computed in service** |
| `points` | Points (**W = 3, D = 1, L = 0**) |
| `recentMatches` | Last 5 matches with W/D/L + score + opponent (computed on read) |

**How to read the standings**:
- **Title race** = top 2, usually decided in the final few weeks
- **Promotion / relegation line** = 9-12 is the "playoff band", 13+ is "relegation zone"
- **Goal difference** is the **most important tie-breaker** at equal points (scored a lot vs conceded a little)
- **Goals for** is the next tie-breaker when GD is equal

**Recent form**:
- `recentMatches` is computed on read, shows **last 5 matches** as W/D/L
- Hot streak = consecutive Ws, cold streak = consecutive Ls, mid-table = alternating

---

## 6. Public endpoints

| Endpoint | Purpose | Key params |
|---|---|---|
| `GET /leagues` | List all leagues (paginated) | `page`, `limit` |
| `GET /leagues/:id` | Single league meta | `id` (UUID or name) |
| `GET /leagues/:id/standings` | Standings | `season` (default 1) |
| `GET /leagues/:id/seasons` | Seasons with data (descending) | — |

> **Season** is an int starting at 1. MVP defaults to `season=1`, increments over time.

---

## 7. Season flow (overview)

```
Week 1 ── rounds 1-2 ──→ Week 2 ── rounds 3-4 ──→ ... ──→ Week 16 ── rounds 29-30 ── close
                                                                                  ↓
                                                                       promotion / relegation
                                                                                  ↓
                                                                          next season (new league?)
```

| Phase | Length | What you do |
|---|---|---|
| **In-season** (weeks 1-15) | 15 weeks | Watch standings, submit tactics, play matches, transfer |
| **End of season** (week 16) | 1 week | Final round, playoffs |
| **Off-season** | A few days - 1 week | Promotion / relegation settlement, next-season schedule generation |
| **Next season** | Starts immediately | Team may be in a **new league** (L1→L2 or L2→L1) |

> No "draft" or "pre-season" — the schedule is generated once at the start of the season, all 30 rounds locked in.

---

## 8. How this connects to other concepts

| Concept | Connection |
|---|---|
| **Team** | A team is in **1 league** (set at creation), plays 30 matches per season |
| **Match** (Chapter 6) | League matches have a `leagueId` field; non-league matches (cup) have `cupId` |
| **Cup** (Chapter 21) | Cup is cross-league (National Cup = L1-L4 all), **independent** of the league |
| **Player** (Chapter 4) | A player's **current league** = his team's league; players don't carry their own league |
| **Transfer** (Chapter 18) | Cross-league transfers **not yet supported** (same-league only) |
| **Youth** (Chapter 19) | A youth's league = the **team** he belongs to |
| **Finance** (Chapter 9) | End-of-season rank prize = see next section |

---

## 9. Season-end rank prize

A season-end "rank prize" is paid out by final position, to incentivize chasing L1 / avoiding relegation:

| Position | Approximate prize | Notes |
|---|---|---|
| **1st (champion)** | Large | L1 >> L2 >> L3 >> L4 (lower-tier champion prize is small) |
| **2nd-4th (silver / bronze)** | Medium-large | |
| **5th-8th (mid-table)** | Medium | |
| **9th-12th (playoff band)** | Small | Small money, but **no relegation** |
| **13th-16th (relegation zone)** | 0 or negative | **Relegation itself** may hit finances (lower-tier sponsorships pay less) |

> Exact numbers depend on tier + current sponsor contract, see [Chapter 9](09-finance.md). **MVP-stage numbers are rough**; precise figures are in the Finance Transaction History.

---

## 10. Match type / experience (link to Chapter 6 + Chapter 4)

League matches award player XP based on **full 90 minutes**, at **1.0×** (baseline):

| Match type | EXP multiplier | Is it a league match? |
|---|---|---|
| **League** | **1.0×** (baseline) | ✅ |
| **Cup** | 1.0× | See Chapter 21 |
| **Playoff** | 2.0× | Not league, but season-end |
| **National team** | 5.0× (fastest growth) | Not league |
| **Tournament** | 0 (doesn't count) | Not league |
| **Friendly** | 0.1× | Not league |

> **The league is the main source of player XP** (30 matches = 30 XP, ~2-3 levels per season).

---

## 11. Can / can't do

### ✅ Can

- View any league's standings (public)
- View your own team's position, record, points
- View last 5 matches (recentMatches)
- Browse standings across seasons (use `?season=N`)
- See which seasons have data (`/leagues/:id/seasons`)

### ❌ Can't (player-side)

- **Manually create / edit / delete leagues** — `POST /leagues` / `PATCH /leagues/:id` / `DELETE /leagues/:id` are admin-only
- **Switch leagues** — team is locked to its tier on creation; only promotion / relegation crosses
- **Manually trigger promotion / relegation** — auto-settled at season end
- **Change maxTeams / promotionSlots** — league rules are **hard-coded** in the season generator
- **Cross-league transfers** — same-league only (see Chapter 18)

### ❌ MVP limits

- **Only L1-L4 exist** — no L0 / L5 / L6 (L0 not needed — L1 is the top; L5 / L6 reserved for future)
- **No "same-tier division swap"** — L2 div 1 doesn't trade places with L2 div 2 (only across tiers)
- **No playoff system** — `playoff_slots` is for the **promotion / relegation playoff** (positions 9-12), not season-end playoffs

---

## 12. Common mistakes (about leagues)

❌ **"9th = promoted"**: 9-12 is the **playoff band**, **not** direct promotion — you have to win the playoff
❌ **"13th = relegated"**: 13th is **direct relegation**, **no** playoff chance
❌ **"Goal difference doesn't matter"**: equal points → **GD is the first tie-breaker**; 1st vs 2nd can hinge on this
❌ **"L1 champion = national champion"**: L1 champion = L1 league champion. **National champion = National Cup winner** (see Chapter 21)
❌ **"30 matches = 30 weeks"**: 30 matches compressed into 16 weeks — actual cadence is **2 matches per week** (Wed + Sat)
❌ **"Promotion depends on PWI"**: promotion depends on **season record** (points + GD + goals), **not** PWI
❌ **"L1 promotes to L0"**: L1 **is** the top, no L0. L1 relegation is to L2
❌ **"Teams change across seasons"**: **1360 teams are fixed** (written once at season generation); new seasons **don't** add or remove teams
❌ **"Promoting to L1 is the end"**: promoting to L1 is a season goal, but the **cup** still runs — see Chapter 21

---

## 13. Practical flow (manager view)

### Season goal by tier

| Your tier | Realistic goal |
|---|---|
| **L4** | Promote to L3 (top 1 + 4 playoff spots, high probability) |
| **L3** | Promote to L2 (competitive, top 1 + 4 playoff) |
| **L2** | Reach L1 playoff (9-12) → promote to L1 |
| **L1** | Avoid relegation (stay above 12th) → long-term: win the cup |

### Weekly rhythm (typical)

| Day | Event |
|---|---|
| **Mon** | Training / finance / lineup (no match) |
| **Tue** | **Cup** (if still in the cup) |
| **Wed** | **League** |
| **Thu** | **Cup** |
| **Fri** | Training / lineup |
| **Sat** | **League** |
| **Sun** | Training / lineup / check standings |

### How often to check the standings

- **Early season** — one glance, focus on **your position** + **top 8 opponents**
- **Mid-season** — 1-2 times / week, watch **GD** + **goals for** (tie-breakers)
- **End of season** — every day, **critical focus on 9-12** (playoff band)
- **Playoff week** — must check, this is the promotion / relegation decider

### Key opponents

- **Top 4** = direct title rivals, **study hard** (PWI / tactics / form)
- **5-8** = mid-table, less critical
- **9-12** = **playoff opponents**, **study hard** (your matches vs them decide promotion)
- **13+** = your "wins for free", rack up GD (may decide tie-breaker)

---

## Next

- [Chapter 6: Match Basics](06-match-basics.md) — match types + EXP multipliers
- [Chapter 9: Finance](09-finance.md) — rank prize + wages + ledger
- [Chapter 18: Transfer Market](18-transfer.md) — same-league buy / sell
- [Chapter 21: Cup System](21-cup-system.md) — National Cup, cross-league single elimination
