---
order: 15
slug: tactics
title: Match: Tactics
status: full
lastUpdated: 2026-09-02
relatedChapters: [3, 5, 6, 14, 16]
relatedEntries: [w-vs-wm, wbl-vs-lb, am-vs-cm, dm-vs-cdm, cfl-cfr-vs-cf]
---

# Match: Tactics

Tactical style = the 3 dimensions (tempo / pitch width / defensive line) you set **before each match kicks off**, each with 3 levels, applied to the **whole team** on the pitch. Once the match starts, tactics are locked; you cannot change them mid-game.

[Chapter 5](05-lineup-basics.md) covers **how to submit tactics** (UI / presets / locking). This chapter covers **how each of the 3 dimensions affects the match**, and **how to pick them based on opponent and squad**.

---

## The 3 dimensions (quick reference)

| Dimension | Levels | Key effect | How it links to players |
|---|---|---|---|
| **Tempo** | slow / balanced / fast | Drives attack pace (fast = more counters, slow = more possession) and **post-loss reaction** | Headline pace / passing decides whether you can play fast |
| **Pitch width** | narrow / balanced / wide | Drives **flank** vs **central** play | W / wing-back more comfortable in wide; AM / CM more comfortable in narrow |
| **Defensive line** | low / mid / high | Drives **attacking press** and **counter-exposure** (offside logic not yet wired up, so it doesn't drive offside today) | Fast CBs are fine on a high line; slow CBs need a low line |

> All 3 dimensions default to **balanced / balanced / mid**. Use the default when you have no opinion.

---

## 1. Tempo

**Tempo = overall team build-up speed**, 3 levels:

### Slow

- **Attack pattern**: short passing, **few counters**, possession is stable
- **Match shape**: **fewer shots but more stable quality**, **slower reaction to losing the ball** (slight second-ball vulnerability)
- **Good for**:
  - Squad that's **weaker than the opponent** → possession reduces mistakes
  - **Defensively-heavy formations** (5-3-2 / 5-4-1)
  - **Protecting a lead** (paired with a sub-on event, see [chapter 16](16-subs-and-orders.md))

### Balanced

- Short / long / through / dribble / long-shot ratios are **even**
- **Default**; use this when you have no opinion

### Fast

- **Attack pattern**: **through balls + dribbles** dominate, lots of counters, **direct pressure on the back line**
- **Match shape**: **more shots**, **faster reaction to losing the ball** (instant press), but **more turnovers** (passing accuracy drops)
- **Good for**:
  - Squad with **fast players** (SPEEDSTER wings / COMPOSED strikers)
  - **Front-three formations** (4-3-3 / 4-2-3-1)
  - Chasing a deficit (paired with a sub-on event to bring on a striker)

### How to pick

| Your situation | Suggested tempo |
|---|---|
| **Pace / passing high**, opponent weak | **fast** — overwhelm them |
| **Pace / passing low**, opponent strong | **slow** — possession reduces mistakes |
| Both **average** | **balanced** — default |
| **Leading** (paired with a sub event) | **slow** — hold the ball, run down the clock |
| **Trailing** | **fast** — more counters |

---

## 2. Pitch width

**Pitch width = lateral-space preference**, 3 levels:

### Narrow (central)

- **Attack pattern**: **central**, **fewer flank runs**
- **Match shape**: dense midfield, flank defending is harder but **central control is strong**
- **Good for**:
  - Squad with **no strong wingers / wing-backs**
  - Wanting **central penetration** (with a strong AM / CF)
  - Midfield-heavy formations like 5-3-2

### Balanced

- Flank / central ratios are even
- **Default**

### Wide (stretched)

- **Attack pattern**: **flanks**, lots of crosses
- **Match shape**: **flank threat is big**, but **central is empty** → vulnerable to counters through the middle
- **Good for**:
  - Squad with **strong wingers / wing-backs** (`DRIBBLER` / `CROSSER` / `SPEEDSTER`)
  - **5-3-2 / 3-5-2** formations that need wing-back runs
  - 4-3-3 driven from the flanks

### How to pick

| Your situation | Suggested width |
|---|---|
| **Wingers / wing-backs are strong** | **wide** — stretch the flanks and cross |
| **Flanks are weak**, **central is strong** | **narrow** — go through the middle |
| **Strong vs weak** | **wide** — stretch the opponent's block |
| **Weak vs strong** | **narrow** — tighten the middle |
| Both average | **balanced** — default |

---

## 3. Defensive line

**Defensive line = where the back four / three stand on the pitch**, 3 levels. **This is the highest-impact dimension of the three** because it directly drives the **attacking press** vs **counter-exposure** trade-off.

> **About offside**: the engine has the defensive-line→offside-probability constants (1% / 4% / 15% for low / mid / high) **but the simulation logic isn't wired up yet** — meaning a high line **does NOT actually call more offside** on the pitch (cross-ref [chapter 14](14-set-pieces.md) "Offside" section). When it gets wired up, an extra cost will land here. What follows is the **current live effect**.

### Low (deep block)

- **Position**: the back line stays close to their own box
- **Match shape**:
  - **Counter space is small** (opposition has to run a long way after winning the ball)
  - **Attacking press is weak** (you wait for the opponent to push up)
- **Good for**:
  - **Weak vs strong** counter-attacking setups
  - **Protecting a lead** (paired with a sub event, hold the line)
  - Squads with **slow CBs** that can't push up

### Mid (default)

- Position is around the middle of the pitch
- **Counter-exposure / attacking press** are all balanced
- **Default**

### High (high press)

- **Position**: the back line sits near the halfway line
- **Match shape**:
  - **Counter space is huge** (long balls / through balls split the line easily)
  - **Attacking press is strong** (win the ball back fast)
- **Good for**:
  - **Strong vs weak** high-pressing setups
  - Squads with **fast CBs / sweeper-keepers** (`SWEEPER_KEEPER` specialty)
  - 4-3-3 setups that need to press high

### The real cost of going high (today)

**The real trade-off is attacking press vs counter-exposure, not offside**:

- **High line bonus**: **stronger pressing**, **faster ball recovery**
- **High line cost**: **bigger space behind for counters**

> **Future** if the offside simulation is wired up, an extra cost ("more offside") will join this list. **Not today**.

If your CBs are slow, the high line will get torn open on the counter. If your CBs are fast, the high line + fast wingers = a machine.

### How to pick

| Your situation | Suggested height |
|---|---|
| **Strong vs weak** | **high** — press the opponent |
| **Weak vs strong** | **low** — sit deep, counter |
| **Fast CBs** + **fast keeper** | **high** — back line can catch up |
| **Slow CBs** | **low** — don't get hit on the counter |
| **Leading** | **low** — sit on the lead |
| **Trailing** | **mid / high** — apply pressure (but don't over-commit) |

---

## 4. How the 3 dimensions combine (common combos)

### 1. Balanced / generic (default)

**balanced / balanced / mid** — nothing special, works most of the time.

### 2. High press (strong vs weak)

**fast / wide / high** — overwhelm with pace and width, the high line makes it hard for the opponent to play out from the back.

**Pre-req**: fast players (W / CB / GK all need pace), strong frontline pressure (`DRIBBLER` / `SPEEDSTER` / `COMPOSED`).

### 3. Counter-attack (weak vs strong)

**slow / narrow / low** — tighten the middle, let the opponent grind down the flanks, the back line stays dense.

**Pre-req**: enough bodies at the back, CBs with strong positioning (not pace, but `TACKLER` / `WALL` specialty).

### 4. Possession burn (leading)

**slow / balanced / low** — hold the ball, don't take risks, drag time out up top.

**Pre-req**: enough stamina in the tank, midfielders who can hold the ball (AM / CM headline passing).

### 5. All-in attack (trailing)

**fast / wide / high** — push everyone up, lots of flank crosses, striker leading the line.

**Pre-req**: not too late in the game (before ~70'), opponent hasn't parked the bus.

### Combinations to avoid

- **fast / high** with **slow CBs** = disaster, you get countered to death
- **slow / wide** with **no wingers** = wasted width, the flanks are empty
- **fast / narrow** = contradictory — fast wants through balls or flanks, narrow forces central play, the two pull in opposite directions

---

## 5. Tactics and your squad

Tactics are the **team config**; players are the **individual ability**. They have to match.

### Headline ability vs tactical ask

| Tactical ask | Headline you need |
|---|---|
| **Fast tempo** | `SPEEDSTER` W / `COMPOSED` CF / `DRIBBLER` AM |
| **Slow tempo** | `PLAYMAKER` CM / `TACKLER` DM / high headline passing |
| **Wide** | `CROSSER` W / `DRIBBLER` wing-back |
| **Narrow** | `PLAYMAKER` AM / `COMPOSED` CF (central play) |
| **High line** | Fast CBs / `SWEEPER_KEEPER` GK |
| **Low line** | `TACKLER` / `WALL` CBs (positional sense) |

### What if your squad doesn't fit

- **Slow squad, fast tempo wanted** → players turn over the ball constantly, fast tempo actually loses you the match
- **Weak wingers, wide wanted** → the flanks get picked on, you get torn open from the side
- **Slow CBs, high line wanted** → you get hit on the counter constantly
- **Conclusion**: **tactics should follow the squad**, not the other way around

---

## 6. Submitting and locking

Tactics are submitted **before kickoff**, locked the moment the match starts:

| Phase | What you can do |
|---|---|
| **Scheduled** | Submit / edit tactics (as many times as you want) |
| **Tactics locked** (~30 min before kickoff, UI auto-locks) | **No more edits**, UI shows a countdown |
| **In progress** | Match is live, tactics are frozen, no mid-game changes |

> **Lock timing**:
> - **UI lock** (editor goes read-only): **~30 min before kickoff**
> - **Backend hard lock** (server refuses new submissions): **~10 min before kickoff**
>
> The two times don't match — the UI is conservative and locks 20 min before the backend does. In practice, once the UI locks, stop trying.

**How to avoid missing the lock**:
- Submit tactics **at least 1 hour before kickoff**
- Use **presets** to save common setups (see [chapter 5](05-lineup-basics.md)), then apply + submit right before the match
- Check the schedule ahead of time, don't scramble at the last minute

---

## 7. Tactical changes (mid-match triggers)

Tactical **style** is set **pre-match**. Mid-match (at a specified minute + condition) you can still trigger **substitutions / position swaps** — see [chapter 16](16-subs-and-orders.md).

> Tactical changes ≠ tactical style. Tactical **style** is the "way of playing", fixed pre-match. Tactical **changes** are "who comes off, who comes on, who moves where", triggered on a timer.

---

## 8. How this connects to other concepts

| Concept | Connection |
|---|---|
| **Lineup** (chapter 5) | Formation + starters + bench + tactical changes = a full match plan; tactical style is the "playing style" slice of that plan |
| **Player skills** (chapter 2) | Tactics need to match headline skills (fast tempo needs pace heads) |
| **Player positions** (chapter 3) | Formation picks positions; tactics pick how to play them |
| **Specialties** (chapter 4) | Tactics trigger specialties (fast + `SPEEDSTER` = counter machine; high line + `SWEEPER_KEEPER` = solid back line) |
| **Match events** (chapter 6) | Tactical style affects the **frequency and distribution** of every match event (shots / counters / tackles...) |
| **Set pieces / offside** (chapter 14) | Defensive line height **today** only drives **attacking press / counter-exposure** (offside logic not yet wired up, see the "Offside" section in chapter 14) |
| **Tactical changes** (chapter 16) | Tactical style is pre-match; tactical changes are mid-match |
| **Tactical presets** (chapter 5) | Save + reuse common setups; don't rebuild every match |

---

## 9. Common mistakes

❌ **"Fast tempo is always better"**: **fast = more turnovers**; if your squad isn't fast, fast tempo actually costs you goals
❌ **"High line = more offside = bad tactic"**: today, a high line **does NOT trigger more offside** (the simulation isn't wired up yet); the real cost of the high line is **getting hit on the counter**; once the offside logic is wired up, this trade-off will be complete
❌ **"Wide = lots of flank play"**: wide **needs strong wingers**; no winger = no flank
❌ **"Narrow = parking the bus"**: narrow = **central play**, not parking the bus; 5-3-2 + narrow = possession
❌ **"Defensive line height = playing style"**: line height is an **attacking press / counter-exposure** trade-off, not the style itself
❌ **"Tactics are independent of players"**: tactics tie tightly to **headline skills**; strong-vs-weak with weak players = wasted tactics
❌ **"I can still edit after lock"**: once the UI locks, stop trying; the backend also refuses new submissions ~10 min before kickoff
❌ **"The 3 dimensions are independent"**: they **interact** (fast + high + slow CB = disaster; slow + low + strong striker = wasted)
❌ **"Push the line up to win"**: high line **isn't a free win**, depends on CB speed + opponent's counter threat
❌ **"Try all 5 formations"**: formation picks the **positions**, tactics pick the **style**; **first pick the formation that fits your squad, then tune the tactics**

---

## 10. How to use tactics (practical flow)

### Step 1: Look at your squad

- **Pace headlines**? → fast tempo
- **Passing headlines**? → slow tempo / possession
- **Strong wingers**? → wide
- **Strong AM**? → narrow
- **Fast CBs**? → high line
- **Positional CBs**? → low line

### Step 2: Look at the opponent

- **Strong vs weak** → press (fast / wide / high)
- **Weak vs strong** → counter (slow / narrow / low)
- **Even matchup** → default (balanced / balanced / mid)

### Step 3: Look at the match situation

- **Leading** → slow / low (possession, sit on it)
- **Trailing** → fast / high (press, before ~70')
- **Draw** → default

### Step 4: Save as a preset

Save a few common setups as presets (home / away / strong opponent / weak opponent), apply the right one before kickoff, **don't rebuild from scratch every match**.

---

## Next

- [Chapter 3: Player Positions](03-positions.md) — how to pick a formation, how headlines and positions fit together
- [Chapter 5: Lineup Basics](05-lineup-basics.md) — tactics editor + tactical changes + tactical presets
- [Chapter 6: Match Basics](06-match-basics.md) — how tactical style shows up in match events
- [Chapter 14: Set Pieces and Special Events](14-set-pieces.md) — the "Offside" section, "Current status — simulation logic not wired up yet"
- [Chapter 16: Subs and Team Orders](16-subs-and-orders.md) — mid-match subs and position swaps
