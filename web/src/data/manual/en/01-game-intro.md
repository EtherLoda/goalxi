---
order: 1
slug: game-intro
title: Game Introduction
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 4, 5, 14, 17, 18]
relatedEntries: [pwi-vs-overall, outfield-skills-meaning, experience-meaning, player-event-types, comparing-two-players]
---

# Game Introduction

Welcome to **GoalXI** — a virtual football management game where you play as both head coach and owner of a real-player squad, taking it from the bottom division all the way to a championship contender.

## What this game is

GoalXI lets you:

- **Take over a small club** — start in the lowest division with a starting squad, stadium, and a small budget
- **Compete with players worldwide** — your group has real players plus AI-controlled BOT teams to fill out the league
- **Build the club end-to-end** — tactics, lineup, training, transfers, youth, finances, all in your hands
- **Climb the ladder** — a **multi-tier league pyramid** (tier count is configurable / extensible, see current game config for the exact number), fight your way to the top flight and chase the title

Matches follow a **set-up-then-watch** model, not real-time / not turn-based / not "manage while it plays":

- **Pre-match** (more than 10 min before kickoff) → you set the **starting XI, bench, tactics, and team orders**
- **T-minus 10 minutes** → tactics lock; no further changes
- **Match day** → the game auto-simulates per your setup; events stream in one by one (the scoreboard updates live, like watching a small broadcast)
- **During play** → there are **no in-match actions** (no subs / no tactical changes / no live orders)
- **Post-match** → full event timeline, player ratings, and event history

So the result is largely decided by **your pre-match setup**. Watching the live stream is reading the outcome. All the tactical work happens before kickoff.

## What you play

You wear two hats:

- **Head coach** — pick the starting XI, set tactics, manage training, and set up match-day orders (**no live changes once the match starts**)
- **Club owner** — decide who to buy and sell, upgrade the stadium, hire and fire staff

Your day-to-day:

- **Tactics / lineup** — formation, starters and bench, in-match orders
- **Training** — choose what the squad focuses on this week (fitness / technical / mental / set pieces / GK)
- **Transfers** — buy from the open market, list your own players, track targets
- **Youth** — recruit prospects through your scout network and develop them into starters
- **Finances** — wages, attendance, stadium upgrades, transfer budget
- **Staff** — hire from 7 staff roles (fitness, psychology, technical, set piece, GK coaches, doctors, head coach)

You don't have to log in every day, but winning requires **continuous management**. Players need long-term development, the squad needs long-term planning.

## The core loop: a GoalXI week

A typical week (league vs cup schedules differ slightly):

| Day | Main events |
|---|---|
| **Monday** | Senior skill decline (background tick, no action needed) |
| **Tuesday** | Cup matchday |
| **Wednesday** | League matchday #1 |
| **Thursday** | Training settlement + wages + senior decline + fire window (youth reveal too) |
| **Friday** | Some cup rounds |
| **Saturday** | League matchday #2 |
| **Sunday** | Free day: list / sign / stadium upgrade / adjust training |

All matches kick off at **UTC 06:00** (14:00 China time / 08:00 Europe / 02:00 US East). Tactics **lock 10 minutes before kickoff** — late changes won't apply.

Each season is **16 weeks**, then promotion / relegation + cup finals + awards + season archive.

## How to win

There's no single "win condition". Multiple paths count as winning:

- **League title** — climb from L4 to L1 and win the top-flight title (the ultimate goal)
- **Cup / playoff** — win the cup or playoff championship
- **Youth development** — turn a prospect from L0 to L20 "Beyond Compare" (most satisfying long arc)
- **Transfer profit** — buy low, sell high, run a financially healthy club
- **National team** — get your players called up to the national team, where matches give 5x experience

**Long-term thinking is the core.** It doesn't happen fast. The more you play, the more your youth tree, transfer strategy, and squad chemistry compound over 3-4 seasons.

## Major systems at a glance

GoalXI's core systems (detailed in later chapters):

| System | Chapter | One-liner |
|---|---|---|
| Player skills | [Ch 2](../02-player-skills.md) | 10 outfield skills + 9 GK skills |
| Player positions | [Ch 3](../03-positions.md) | 14 position families + headline skills (qualitative) |
| Player other attributes | [Ch 4](../04-player-attributes.md) | PWI, form, EXP, injury, specialty |
| Lineup | [Ch 5](../05-lineup-basics.md) | 14 positions + substitution |
| Match basics | [Ch 6](../06-match-basics.md) | 90-min real-time sim, 14 event types |
| Training | [Ch 7](../07-training.md) | 5 training categories |
| Staff | [Ch 8](../08-staff.md) | 7 StaffRole types |
| Finance | [Ch 9](../09-finance.md) | Wages, income, Goalxi Coin |
| Fans | [Ch 10](../10-fans.md) | Attendance, fan reaction |
| Stadium | [Ch 11](../11-stadium.md) | Capacity, seats, upgrades |
| Set pieces | [Ch 14](../14-set-pieces.md) | Free kicks, penalties, special events |
| Match tactics | [Ch 15](../15-tactics.md) | tempo / pitchWidth / defensiveLine |
| Subs and team orders | [Ch 16](../16-subs-and-orders.md) | In-match adjustments, substitutions |
| Transfers | [Ch 18](../18-transfer.md) | Open market, auction, buyout |
| Youth and scouts | [Ch 19](../19-youth.md) | Recruit, reveal, promote |
| League system | [Ch 20](../20-league-system.md) | Multi-tier pyramid (tier count configurable) |
| Cup system | [Ch 21](../21-cup-system.md) | Cup + playoffs |
| National team | [Ch 24](../24-national-team.md) | NATIONAL_TEAM, 5x EXP |

> Chapter links are relative paths. If you move the whole manual to a different location, remember to update them.

## How you interact with other players

GoalXI is not single-player — your opponents are **real humans**:

- **League matches** — 7-8 teams in your group, home and away two rounds, win 3 / draw 1 / loss 0
- **Cups** — randomized against same-tier teams, you may meet familiar opponents repeatedly
- **Transfer market** — all teams share one open market, anyone can bid on your listed players
- **Forum** — community space, 4 categories (announcements / general / tactics / transfer market), open for discussion

So your opponents are **people who think**, not scripts. Wins come from tactics, execution, and long-term vision.

## Our best advice

1. **Read this manual first** — the first few chapters are the core, the rest is reference
2. **Don't rush to buy players** — your initial squad + wage budget is enough to start; understand tactics first
3. **Watch the match-day stream** — events streaming in tell you how your pre-match setup actually played out. The radar + PWI doesn't reveal the in-game impact of your choices; the live event stream does.
4. **Use the forum** — the tactics / transfer / youth categories have experienced players sharing what works
5. **Stay long-term** — if you don't win a title in season one, that's fine; after 3-4 seasons your youth + transfer strategy compounds

> This manual does not document **how GoalXI is implemented**, only **how to play it**. The technical side is out of scope for the player view.

---

**What to read next**:

- [Ch 2: Player Skills](02-player-skills.md) — full breakdown of the 10 outfield + 9 GK skills
- [Ch 3: Player Positions](03-positions.md) — 14 position families + headline skills
- [Ch 4: Player Other Attributes](04-player-attributes.md) — PWI / form / EXP / injury / specialty
