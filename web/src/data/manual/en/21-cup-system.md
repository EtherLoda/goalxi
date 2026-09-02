---
order: 21
slug: cup-system
title: Cup System
status: full
lastUpdated: 2026-09-02
relatedChapters: [20]
relatedEntries: []
---

# Cup System

The cup is a **cross-league, single-elimination** competition, 1 per season. The MVP has only one cup: the **National Cup**. All 1360 L1-L4 teams enter. **The winner is the true "national champion"** (different from the L1 league champion).

This chapter covers the **cup structure, entry rules, elimination flow, prize**. The **league** is in [Chapter 20](20-league-system.md).

---

## 1. Why a cup exists

- **Cross-league**: the league is a 16-team mini-loop (L1 plays L1, L4 plays L4); the cup pulls L1-L4 together
- **Single elimination**: every match is win-or-go-home, **no points**, **no promotion / relegation**
- **True "national champion"**: L1 champion = champion of L1's mini-league; **National Cup champion = national champion** (regardless of your tier, you can win it)

> **Hattrick FA Cup model** — top-tier teams (L1) play only a few rounds; lower-tier teams (L4) start from the earliest rounds; amateur sides can upset giants.

---

## 2. National Cup structure (L1-L4)

One **National Cup** per season, all 1360 teams enter, **single elimination**, **12 rounds** to decide the champion.

### Entry round by tier

| Tier | Enter at | Rounds played |
|---|---|---|
| **L1** (16 teams) | **R6** (round of 32) | 6 rounds (R6-R11) |
| **L2** (64 teams) | **R4** (round of 64) | 8 rounds (R4-R11) |
| **L3** (256 teams) | **R2** (round of 256) | 10 rounds (R2-R11) |
| **L4** (1024 teams) | **R0** (round of 1024) | 12 rounds (R0-R11) |

> The lower the tier, the more rounds you play. **Total rounds = 12** (R0 to R11).

### Flow chart (simplified)

```
R0:   1024 L4 teams ── 512 matches ──→ 512 advance
R1:    512 teams    ── 256         ──→ 256 advance
R2:    256 + 256 L3 = 512         ──→ 256 advance
R3:    256 teams    ── 128         ──→ 128 advance
R4:    128 +  64 L2 = 192         ──→  96 advance
R5:     96 teams    ──  48         ──→  48 advance
R6:     48 +  16 L1 =  64         ──→  32 advance
R7:     32 teams    ──  16         ──→  16 advance
R8:     16 teams    ──   8         ──→   8 advance
R9:      8 teams    ──   4         ──→   4 advance
R10:     4 teams    ──   2         ──→   2 (final two)
R11:     2 teams    ──   1 (final) ──→  1 = champion
```

> Matches per round = previous-round advancers / 2 (single elimination). **No byes** (every round is even, halves cleanly).

---

## 3. Season cadence

- **1 National Cup per season**
- **1 round per week** = 12 weeks to finish
- **Match days: Tue + Thu** (`GAME_SETTINGS.MATCH_KICKOFF_HOUR_UTC: 6:00 UTC = 14:00 China time`)
- **R0 starts in week 2 of the season** (R0 = `initDate + 7 days`, leaving 1 week for the league)
- **Final R11 lands in week 13** (cup runs 12 weeks, occupies weeks 2-13)
- **League + cup don't collide**: league is Wed + Sat, cup is Tue + Thu

> In practice:
> - L4 / L3 teams: weeks 1-13 all have cup games (1-2 per week), interleaved with the league
> - L1 / L2 teams: weeks 1-6 **no cup**, join from R6 (weeks 7-13)
> - **L1 plays at most 6 cup matches**; **L4 plays at most 12** (R0 to R11)

---

## 4. Elimination rules

| Situation | Rule |
|---|---|
| **90-min draw** | **30-min extra time** (15 + 15, **no stoppage**) + goals decide |
| **Extra-time draw** | **Penalty shootout** (5 + sudden death, see [Chapter 6](06-match-basics.md)) |
| **Draws** | The cup **doesn't allow** draws (unlike the league), must produce a winner |
| **Home / away** | Cup is **single-match elimination**, no "two-leg aggregate" |

> **Vs league**: in the league, 90-min draw = each team gets 1 point (a draw). **In the cup, 90-min draw = extra time + penalties**. Same match, different rules.

---

## 5. What you can see (all **public** endpoints)

| Endpoint | Purpose |
|---|---|
| `GET /cups` | List all cups (filter by `season` / `type`) |
| `GET /cups/:id` | Single cup meta (name / type / status / prize pool) |
| `GET /cups/:id/bracket` | Full bracket — cup meta + every round + every match |
| `GET /cups/:id/rounds/:round/matches` | One round's matches only (for polling) |

### CupResDto fields

| Field | Meaning |
|---|---|
| `id` | Cup id |
| `season` | Season number |
| `type` | `NATIONAL` (MVP only; `SENIOR` / `TROPHY` / `VASE` reserved) |
| `name` | e.g. "National Cup 2026" |
| `status` | `pending` / `in_progress` / `completed` / `cancelled` |
| `prizeCurrency` | Currency (default `CNY`) |
| `prizePool` | Prize pool (winner + runner-up + round bonuses, **bigint** serialized as number) |

### CupBracketResDto fields

| Field | Meaning |
|---|---|
| `cup` | Cup meta |
| `rounds` | 12 rounds, each with matches (home / away / score) |

---

## 6. Prize (prize pool)

| Position | Prize | Notes |
|---|---|---|
| **Champion** | The bulk (depends on season) | `prizePool` mainly goes to the champion |
| **Runner-up** | Smaller | Final loser |
| **Semi-finalists** | Smaller | R10 losers |
| **Quarter-finalists / R16** | Minimal | Later-round losers |
| **Early exits** | 0 | No prize |

> MVP-stage: `prizePool` exists but **defaults to 0**; numbers are **reserved**, populated when season settlement fills them in.
>
> Take-home = prize − no fees (no commission today)

---

## 7. State machine

Each cup has 4 states:

```
PENDING (entries + bracket generated, first round not started)
   ↓
IN_PROGRESS (R0+ matches scheduled / played)
   ↓
COMPLETED (final played, champion decided)
   ↓ (or)
CANCELLED (exceptional case)
```

> **PENDING → IN_PROGRESS** trigger: first match's `scheduledAt` time hit, worker processes
> **IN_PROGRESS → COMPLETED** trigger: final R11 played, system auto-decides champion

---

## 8. Entry rules (player / team)

**Team**:
- Your team is auto-entered (MVP forces all 1360 teams to participate), **cannot withdraw**
- You **can't pick** which round to enter — your tier decides (L1 enters R6, L4 enters R0)

**Player**:
- Players have **no** "cup-specific" concept — they just play matches
- Cup matches give all players **1.0× EXP** (same as the league, see Chapter 6)
- **No special bonus** — the cup is just another match type

---

## 9. League vs cup (overview)

| Dimension | League | Cup |
|---|---|---|
| Scope | 16 teams / league | 1360 teams (national) |
| Format | Double round-robin (home + away) | **Single elimination** (1 match decides) |
| Matches | 30 / team / season | L1 ≤ 6, L2 ≤ 8, L3 ≤ 10, L4 ≤ 12 |
| Cadence | Wed + Sat | Tue + Thu |
| Length | 16 weeks | 12 weeks |
| Promotion / relegation | ✅ Yes | ❌ No |
| Draws | ✅ Yes (1 point each) | ❌ No (extra time + penalties) |
| Champion = | League champion | **National champion** |
| EXP multiplier | 1.0× | 1.0× |

---

## 10. How this connects to other concepts

| Concept | Connection |
|---|---|
| **League** (Chapter 20) | Cup is **fully independent** — you play both at once (if still in the cup) |
| **Match** (Chapter 6) | Cup matches have `matchType = 'CUP'`, **have** a `cupId`; league has `matchType = 'LEAGUE'`, has `leagueId` |
| **Player** (Chapter 4) | Cup matches give 1.0× EXP, same as league |
| **Youth** (Chapter 19) | Youth players belong to a team → team enters cup → youth can play cup |
| **Transfer** (Chapter 18) | Can transfer during the cup, but a **currently-playing** player can't be transferred mid-match |
| **Player event history** (`player-event-types` entry) | Cup champion squad → player detail page may get `CHAMPIONSHIP_TITLE` (see Chapter 4) |
| **Specialty** (Chapter 4) | No "cup bonus" specialty — cup is just 12 high-intensity matches |

---

## 11. Can / can't do

### ✅ Can

- View any cup's full bracket (public)
- View each round's matches (pollable)
- See your team's position and opponent
- Earn cup EXP (1.0× multiplier)

### ❌ Can't (player-side)

- **Withdraw from the cup** — MVP forces all 1360 teams to enter
- **Pick opponents** — bracket pairings are **seeded + automatic**, not Hattrick-style "choose who to play"
- **Reschedule** — there's no `POST /cups/:id/...` create / reschedule endpoint; only admin + scheduler
- **Re-enter** — a team **only** appears **once** per cup per season (eliminated = out)
- **Cross-season** cup archive — MVP-stage cup data is current-season; cross-season archiving (if any) is future

### ❌ MVP limits

- **Only 1 cup type** (NATIONAL), `SENIOR` / `TROPHY` / `VASE` reserved but **not generated**
- **Prize pool 0** — `prizePool` field exists, **no value is filled**
- **No second cup** — can't run "National Cup + Senior Cup" at the same time

---

## 12. Common mistakes (about the cup)

❌ **"L1 champion = national champion"**: L1 champion is just the L1 league champion. **National Cup champion is the national champion**
❌ **"Cup 90-min draw = each team 0 points"**: cup has **no draws**; 90-min draw = **extra time + penalties**
❌ **"Can withdraw from the cup"**: **can't**. MVP forces all 1360 teams in
❌ **"Can pick which round to play"**: determined by **your tier** (L1 enters R6, L4 enters R0)
❌ **"Final is two legs"**: cup is **single-match elimination**, no two legs
❌ **"L1 teams start at R0"**: no, L1 **skips to R6** (round of 32), 6 rounds rest
❌ **"Champion prize = 1 million"**: `prizePool` defaults to 0, **no concrete value yet**
❌ **"Cup XP = league XP"**: both are **1.0×** baseline, no difference
❌ **"Youth can't play in the cup"**: **can** — youth = player, plays the same as senior
❌ **"Can't buy players during the cup"**: **can**. A cup-playing **player** can't be transferred mid-match, but transfers between cup rounds are fine
❌ **"3rd-place playoff"**: cup is **single elimination**, **no 3rd-place match** (semi-final losers both go home)

---

## 13. Practical flow (manager view)

### Cup goal by tier

| Your tier | Realistic cup goal |
|---|---|
| **L4** | Reaching R4 = success (4 upsets); quarter-finals = surprise |
| **L3** | QF is the floor; SF = top performance |
| **L2** | SF is the target; final = achievement |
| **L1** | Winning = national champion — the **highest possible season goal** |

### When to take it seriously

- **L4 / L3** — every opponent matters (very likely to face L1 / L2 strong sides)
- **L1 / L2** — **R6 onward** (round of 32 is when you enter)
- **R0-R1** — most teams are still in lower-tier matchups, spectate

### Tactical scheduling

- **League** and **cup** are in the **same week** (Tue / Wed / Thu / Sat — every day has a match)
- **Same XI can't play all 4** — stamina (Chapter 4) + injury
- **Rotate**: league 1 + cup 1 per week, **at least 2 XIs**:
  - Wed + Sat: **first XI** (league matters)
  - Tue + Thu: **rotation XI** (cup secondary)
- If first XI is gassed, **prioritize the league** (affects standings); cup is expendable

### Key opponents

- **R0-R1** — L4 teams cannibalizing each other, not your problem
- **R2 onwards** — L3 enters, **watch for the lower-tier trap** (their L1 / L2 opponents)
- **R6 onwards** — L1 enters, **real opponents**
- **R10** — SF, usually = L1 + L2 strong sides
- **R11** — final, L1 vs L1 / L2 / L3 / L4 (theoretically anyone)

### Cup champion = a real achievement

- **Winning the national cup = the highest season achievement** (vs the L1 league champion, the cup is **harder** — cross-league + single elimination)
- Team / player detail pages will record a `CHAMPIONSHIP_TITLE` event
- Player history will too

---

## 14. Player event interface (link to Chapter 4)

Cup champion = team-level event. **Player-level** impact:

| Cup result | Player event |
|---|---|
| Team wins the cup | Player detail page gets a `CHAMPIONSHIP_TITLE` event |
| Player scores in the final | (MVP doesn't yet record this separately) |
| Player gets injured in the cup | Same as league, `INJURY` event |

---

## Next

- [Chapter 6: Match Basics](06-match-basics.md) — extra time + penalty shootout in detail
- [Chapter 9: Finance](09-finance.md) — cup prize (future)
- [Chapter 20: League Tier System](20-league-system.md) — league structure, standings, promotion / relegation
- [Chapter 4: Player Other Attributes](04-player-attributes.md) — player `CHAMPIONSHIP_TITLE` event
