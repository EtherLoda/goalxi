---
order: 1
slug: weekly-cycle
title: Appendix 1: GoalXI Week
status: full
lastUpdated: 2026-09-02
relatedChapters: [6, 7, 14, 20, 21]
relatedEntries: []
---

# Appendix 1: GoalXI Week

GoalXI runs on **real time** (1 game day = 1 real day, 1 season = 16 weeks = 112 real days). **All background settlements trigger at 00:00 UTC**; **matches kick off at 06:00 UTC (14:00 China time)**. This chapter lays out "what happens each day of the week" so you can plan your week.

---

## 1. Daily 00:00 UTC background tasks (full table)

Below is every settlement cron that runs daily / weekly. **You don't need to know these timers**; just know when new data lands.

| Time (UTC) | Day | Background task | Player-visible result |
|---|---|---|---|
| **00:00** | every day | `weather-scheduler` | Today's weather (affects match style) |
| **00:00** | every day | `player-wage-scheduler` | Player daily wage accrual |
| **00:00** | **Mon** | `finance-scheduler` | Weekly finance: sponsorship + tickets + wage payouts + rank prize |
| **00:00** | **Mon** | `senior-decline-scheduler` | **28+ year veterans lose skill** (once a week) |
| **00:00 / 00:30** | **Mon** | `injury-recovery` (every 30 min) | Player injury ticks down |
| **00:00** | **Mon** | `season-transition` (checkAndGeneratePlayoffs) | Week 15 → **generate promotion / relegation playoff** |
| **00:00** | **Mon** | `season-transition` (processPlayoffResultsAndSwap) | Week 16 → **swap teams between tiers** |
| **00:00** | **Tue** | `season-transition` (checkAndProcessSeasonStart) | **New season starts**: new schedule / standings / archive |
| **00:00** | **Thu** | `weekly-settlement` | 5 sub-tasks: training / condition / construction / youth-progression / fan |
| **00:00** | **Sun** | `league-award` | Weekly awards (if any) |
| **06:00** | **Sat** | `scout-scheduler` | Scout cycle: refresh candidate pool |
| **every minute** | — | `match-scheduler` | Match preprocess / settle / recovery |
| **every minute** | — | `cup-scheduler` | Cup: monitor + backfill scheduling |

> **Practical**:
> - **Mon** morning: check standings / wages / veteran status
> - **Tue**: new season (season-end) / playoffs (Week 15)
> - **Wed + Sat**: **league days**
> - **Thu**: **training + condition + finance** settlement day
> - **Tue + Thu**: **cup days**
> - **Sat 06:00**: scout refresh
> - **Sun**: weekly awards

---

## 2. What happens each day (player view)

### Monday

**00:00 UTC triggers** (08:00 Beijing):
- ⚙️ **finance-scheduler** — weekly finance: sponsorship / ticket income + wage payout + rank prize (see [Chapter 9](09-finance.md))
- ⚙️ **senior-decline-scheduler** — 28+ veterans lose skill (see [Chapter 4](04-player-attributes.md))
- ⚙️ **injury-recovery** — player injury ticks down daily
- 🏆 **Playoff generation** (Week 15) / **promotion / relegation swap** (Week 16)

**What you do**:
- Check standings update (who's slipping / climbing)
- Check the wage bill (any new contracts?)
- Check veteran attribute changes (who dropped again?)
- Adjust the lineup (before the weekend league)

---

### Tuesday

**00:00 UTC** (Week 1 of new season): **New season starts**:
- ⚙️ New schedule generated (30 matches per team, all in)
- ⚙️ New standings initialized (every team position=1, played=0, points=0)
- ⚙️ Previous season data archived (season results / player stats / transactions / player events)

**06:00 UTC = 14:00 Beijing**: **Cup day** (see [Chapter 21](21-cup-system.md))

**What you do**:
- ⚽ Cup: watch your team's (or opponent's) match
- 💼 Set up the next match's tactics
- Buy / sell to adjust the squad

---

### Wednesday

**06:00 UTC = 14:00 Beijing**: **League day** (see [Chapter 20](20-league-system.md))

**What you do**:
- ⚽ **League**: 1 match per round (Weeks 1-15, 2 matches each = 30)
- Watch post-match standings movement
- Watch post-match player EXP / form changes (see [Chapter 4](04-player-attributes.md))
- Watch post-match player events (Chapter 4 `player-event-types` FAQ)

---

### Thursday

**00:00 UTC**: `weekly-settlement` runs 5 sub-tasks:
- ⚙️ `training-settlement` — training result (skill +1 etc.)
- ⚙️ `condition-settlement` — player form weekly update
- ⚙️ `construction-settlement` — stadium construction (see [Chapter 11](11-stadium.md))
- ⚙️ `youth-progression-settlement` — youth weekly growth (MVP stage: not active)
- ⚙️ `fan-settlement` — fan count / emotion weekly update (see [Chapter 10](10-fans.md))

**06:00 UTC**: **Cup day**

**What you do**:
- ⚽ Cup
- Check training settlement (who grew / who didn't)
- Check form changes (whose form is up)
- Check fan count (Chapter 10)
- Check stadium construction progress

---

### Friday

**No scheduled tasks**. Free day.

**What you do**:
- Look at everything (standings / player board / finance)
- Train (see [Chapter 7](07-training.md))
- Adjust the lineup
- Scout queries
- Sell / buy
- Save tactics preset (see [Chapter 5](05-lineup-basics.md))
- Long-term planning (promote to L1 / chase title)

---

### Saturday

**06:00 UTC = 14:00 Beijing**: **League day**

**What you do**:
- ⚽ **League**
- Watch post-match changes
- Weekly summary (standings movement / player performance / finance)

---

### Sunday

**00:00 UTC**: `league-award` — weekly awards (MVP stage: maybe empty)

**What you do**:
- No match day
- Rest / plan next week

---

## 3. Match times summary (must remember)

| Match type | Time | Frequency |
|---|---|---|
| **League** | **Wed 06:00 UTC** + **Sat 06:00 UTC** | 2 / week |
| **Cup** | **Tue 06:00 UTC** + **Thu 06:00 UTC** | 1-2 / week (depending on rounds) |
| **National team** | Separate calendar (see Chapter 24) | Occasional |
| **Playoff / promotion-relegation** | Week 16 | Weekend / right after the league closes |
| **Penalties / extra time** | After 90-min draw in a match | Match-dependent |

> **1 week = 4 matches** (2 league + 2 cup) — **same XI can't play all 4**, you need to rotate (see [Chapter 4](04-player-attributes.md) stamina)

---

## 4. Key moments (per season)

| Moment | What happens | What you do |
|---|---|---|
| **Week 0** (pre-season) | Team registration / claim (Chapter 1) | Pick players / name the team |
| **Week 1 day 1** | League round 1 match (Wed) | Submit tactics, watch the match |
| **Week 1-13** | Cup runs (R0 to R11) | Parallel to league, watch the cup bracket |
| **Week 15 weekend** | League closes (30 matches done) | Check final standings |
| **Week 16 Mon** | Playoffs generated | Check 9-12 opponents |
| **Week 16 weekend** | Playoffs played | Did you promote / avoid relegation? |
| **Week 16 Mon** | Promotion / relegation swap | Team may **jump leagues** |
| **Week 16 Tue 00:00** | New season starts | Immediately into next season |

> **Season rhythm** = 1 week registration + 15 weeks league + 1 week playoffs + cross-season immediately = **17 weeks per cycle**

---

## 5. Special moments (per "game day")

> A "game day" = 1 real day. All background crons trigger at 00:00 UTC; **matches kick off at 06:00 UTC**.

| UTC | Beijing | Event |
|---|---|---|
| **00:00** | 08:00 | All daily / weekly crons fire |
| **00:30** | 08:30 | `injury-recovery` every 30 minutes |
| **06:00** | 14:00 | Match kickoff (league / cup) |
| **07:00** | 15:00 | 90 min + stoppage (15:00 - 16:00) |
| **07:00** | 15:00 | Extra time (cup draw) |
| **07:30** | 15:30 | Penalty shootout (still drawn after ET) |
| **every minute** | every minute | `match-scheduler` preprocess / settle |

> A match usually takes 90-120 minutes of real time, then the engine takes 1-2 minutes to process events. The **live broadcast** is the event stream you see from kickoff for the next 1-2 hours.

---

## 6. Mapping to real time

| Real | Game |
|---|---|
| 1 real day | 1 game day |
| 1 real week (7 days) | 1 game week (Week 1-16) |
| 1 real season (16 weeks = 112 days) | 1 game season (season 1, 2, 3, ...) |
| 1 real year (~52 weeks) | ~3 game seasons (16 wks each + intervals) |

> **GoalXI does not speed up**. 1× real time (`MATCH_STREAMING_SPEED: 1.0`). **A season ≈ 4 real months**.

---

## 7. Time zones (UTC vs Beijing)

**All times are UTC**. China players +8h:

| UTC | Beijing (UTC+8) |
|---|---|
| 00:00 | 08:00 |
| 06:00 | 14:00 |
| 12:00 | 20:00 |
| 18:00 | 02:00 (next day) |

> **Matches are fixed at 06:00 UTC = 14:00 Beijing** — any time-zone player plans around "league at 2pm, cup at Tue / Thu 2pm".

---

## 8. Off-season (between seasons)

League Week 16 Tuesday 00:00 UTC = **new season immediately starts**. **There's no 1-2 week "off-season"**.

In practice there's a few hours to 1 day of "switch-over":
- Mon 00:00 UTC: playoff / promotion-relegation swap
- Tue 00:00 UTC: new schedule / standings init
- Tue 06:00 UTC: first match

> **Mon afternoon** you may still be watching playoffs, **Tue 14:00** you're already in the new season's first league game. **Fast**.

---

## 9. Can / can't (about the week)

### ✅ Can

- See new data after 00:00 UTC settlement
- Watch matches live at 06:00 UTC
- Plan "I do X on Y day" (e.g. "Friday is for long-term planning")
- Play across time zones (matches fixed at 06:00 UTC, plan around that)

### ❌ Can't (player-side)

- **Speed up / slow down time** — no `MATCH_STREAMING_SPEED` player control
- **Skip the wait** — must watch the 90 minutes
- **Manually trigger background tasks** — training / finance are automatic
- **Change match time** — 06:00 UTC is hard-coded
- **Change week length** — 7 days / week fixed
- **Change season length** — 16 weeks / season fixed

### ❌ MVP limits

- Matches **don't** support replay (only live)
- Matches **don't** support fast-forward (must wait real time)
- No "speed-up mode"
- No "compressed week" (1 real day = 1 game day, **can't** 1 real day = 1 game week)

---

## 10. Common mistakes (about the week)

❌ **"Matches kick off at 00:00"**: matches kick off at 06:00 UTC = **14:00 Beijing**; 00:00 is the background tasks
❌ **"Training ticks every day"**: only the **Thursday** training settlement runs; other days the engine doesn't run training
❌ **"Form changes daily"**: only the **Thursday** settlement runs; form doesn't change day-to-day (but form bonuses apply in real time)
❌ **"Wages deducted daily"**: deducted **once a week, on Monday**
❌ **"Veterans lose skill daily"**: skill decay runs **once a week, on Monday** (see Chapter 4)
❌ **"Playoffs auto-play"**: playoffs **wait for Mon 00:00 UTC cron** to generate, **then** are scheduled for Week 16 weekend
❌ **"Season end = next season immediately"**: there's a **1-day** "Tue 00:00 switch-over" — Mon afternoon you're still in playoffs, Tue 14:00 you're in the new season's first game
❌ **"I can skip the match and get the result"**: **no** — must watch real time (1× speed)
❌ **"1 week = 7 real days"**: **yes**, 1 real week = 1 game week, fixed 7 days
❌ **"Matches auto-play when I'm away from the computer"**: **yes**, the engine runs; you come back to the result

---

## 11. How this connects to other concepts

| Concept | Connection |
|---|---|
| **Match** (Chapter 6) | 06:00 UTC kickoff, 90 min (Chapter 6) |
| **Training** (Chapter 7) | **Thursday** settlement (Chapter 7) |
| **Tactics** (Chapter 15) | **10 minutes before kickoff** submit lock (Chapter 15) |
| **League** (Chapter 20) | **Wed + Sat** matches |
| **Cup** (Chapter 21) | **Tue + Thu** matches |
| **Player attributes** (Chapter 4) | **Mon** decline + **Thu** form settlement |
| **Finance** (Chapter 9) | **Mon** settlement |
| **Season boundary** | **Mon / Tue 00:00** switch-over |

---

## Next

- [Chapter 6: Match Basics](06-match-basics.md) — in-match 90-min rhythm
- [Chapter 7: Training](07-training.md) — Thursday training settlement
- [Chapter 15: Match Tactics](15-tactics.md) — pre-match 10-min lock
- [Chapter 20: League Tier System](20-league-system.md) — 16 weeks / 30 matches
- [Chapter 21: Cup System](21-cup-system.md) — 12 weeks / 12 rounds
