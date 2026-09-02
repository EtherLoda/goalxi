---
order: 14
slug: set-pieces
title: Match: Set Pieces and Special Events
status: full
lastUpdated: 2026-09-02
relatedChapters: [6, 15]
relatedEntries: [specialties-meaning, player-event-types]
---

# Match: Set Pieces and Special Events

The "non-flow" events in a match — **corners, free kicks, penalties, cards, injuries, own goals, extra time and penalty shootout** — all change the scoreline or the on-pitch numbers. The match runs automatically on your lineup + tactics + preset, so you can't pause mid-game to pick a taker. You can only **shape the outcome before kickoff through your lineup, bench, and specialty mix**.

> **About offside**: the engine has the **infrastructure already in place** (event type, stat field, commentary templates, defensive-line→probability constants), but **the simulation logic isn't wired up yet** — meaning the referee **doesn't actually call offside** on the pitch, and the FE shows no offside events. See the "Offside" section below for the full picture.

This chapter explains **how these events happen in a match, what you can see, and how they hook into a player's attributes / specialties**. For the overall match flow see [Chapter 6](06-match-basics.md), for lineup see [Chapter 5](05-lineup-basics.md), for tactics see [Chapter 15](15-tactics.md).

---

## 1. Set pieces (3 main types)

A set piece is a dead-ball restart at a fixed spot — it **breaks** the open play of the 90 minutes and is **handled entirely by the system**. Three main types on the pitch:

| Type | Trigger | Frequency (per match, both sides) | Common outcomes |
|---|---|---|---|
| **Corner** | Ball deflected over the defending team's goal line by a defender | High (8-12) | Most get cleared / headed over / saved; direct goals are **rare** |
| **Free kick** (direct) | Foul just outside the box — can shoot directly | Low (< 2) | Long shot / blocked by the wall / saved; goals are **rare but possible** |
| **Free kick** (indirect) | Foul inside the box / tactical foul | Moderate (a few) | Short passing move / follow-up shot; goals are **a bit more common than direct** |
| **Penalty** | Foul inside the box — 12-yard shootout | Very rare (< 1 per match) | High scoring rate, decisive call |

### Corner

**How it happens**: a defender / goalkeeper puts the ball over their **own** goal line, the attacking side restarts from the **corner flag**.

**Who takes it**: the system **auto-picks** based on the on-pitch players' `freeKicks` skill, **AM / CM positions get a bonus**. You **can't** designate a "corner / free-kick taker" in the lineup editor — there's no such field.

**Scoring rate**: a corner by itself **usually doesn't enter the timeline** (too frequent), but if a goal comes off it, the goal does. Corner goals are **rare** — most get cleared, claimed by the keeper, or headed off target.

**What you see**:
- **Live commentary** (text): "{Team} wins a {left/center/right} corner, {taker} stands over the ball at the flag"
- **Timeline**: the corner itself **typically doesn't** show; the **goal off the corner** does
- **Post-match report**: corner count = your team's corners (visible on the stats page)

### Free kick (direct + indirect)

**How it happens**: a regular foul (tackle, shirt pull, push) → referee blows the whistle → the fouled side gets a **dead ball** at the spot of the foul.

**Two variants**:
- **Direct free kick** — can shoot **straight at goal** from the spot (typical just outside the box)
- **Indirect free kick** — **must** pass to a teammate first, who then shoots (typical inside the box or for a tactical foul)

**Who takes it**: same auto-pick by `freeKicks` skill, AM / CM get a bonus.

**Scoring rate**:
- **Direct free kick** — low but **threatening**; long-range goals are rare but possible each match
- **Indirect free kick** — slightly **higher** than direct (because of the extra pass)

**What you see**:
- **Commentary**: foul → free kick (described as "prime set-piece opportunity" or "standard free kick")
- **Goal**: a direct free-kick goal enters the timeline + commentary template (the long-shot / direct-FK wording)
- **Indirect free-kick goal**: flows like a normal goal, the wording is close to a regular goal

### Penalty

**How it happens**: **foul inside the box** → referee **points to the spot** → 1v1 with the keeper from 12 yards.

**Who takes it**: auto-picked by `penalties` skill (AM / CM bonus), same as free kicks. You can't designate.

**Scoring rate**: **high** (real football is 70-80%; the engine lands close). The **single event** with the highest per-attempt scoring probability on the pitch.

**Why veterans are reliable (the experience bonus)**:
Penalties use a **dedicated bonus — only `form` + `experience`, stamina doesn't count**. Concretely:
- **Full stamina vs gassed** — **no difference** on a penalty (stamina doesn't apply)
- **Veteran (low form but very high experience) vs rookie (great form but low experience)** — veteran is **more reliable** from the spot

See [Chapter 4](04-player-attributes.md) — "veteran penalty bonus" for the full discussion.

**What you see**:
- **Commentary**: a tense buildup before the kick ("all eyes on the penalty spot")
- **Timeline**: the penalty shows
- **Misses**: shown as a separate "penalty missed" — split into two outcomes: **keeper save** / **off target** (post / bar / over)

**GK side — save bonus**:
A GK with `SAVING_MASTER` specialty (GOLD tier is strongest) gets a **stacking save bonus** (additional multiplier on top of the base save). This is the **only specialty** that directly affects penalty outcomes for the GK.

---

## 2. Special events

### Offside

**How it happens**: an attacking player is **closer to the opponent's goal line than the ball** when the pass is played, and **only the keeper is ahead of them** → linesman raises the flag → attacking side **loses possession**.

**Current status — simulation logic not wired up yet**:

The engine **has the offside infrastructure in place**, but **the simulation logic isn't connected yet**:
- The event type `'offside'` is declared in the type union
- The defensive-line→offside-probability constants are defined (low 1% / mid 4% / high 15%)
- The post-match stat field `offsides` exists
- The FE has 2 offside commentary templates ready
- **But there's no `events.push({ type: 'offside' })` anywhere in the engine code** — the simulation never actually produces an offside event

**What this means in practice**:
- **The referee doesn't actually call offside** — no matter how high you push the line, the match isn't affected by offside
- **The FE shows no offside** — nothing on the timeline, the post-match stat is always 0, no commentary drops
- **The "tactical trade-off" doesn't exist yet** — the defensive line **only** drives the **attacking press** vs **counter-exposure** trade-off (see [Chapter 15](15-tactics.md)), **not** offside
- When the simulation logic gets wired up, all of the above will start working automatically — the data layer is ready

> **If / when it gets wired up, here's what players will see** (cross-ref [Chapter 15](15-tactics.md)):
> - Higher defensive line → higher offside rate
> - Offside doesn't enter the timeline (too frequent, like fouls)
> - Post-match stats show the offside count
> - Commentary sometimes drops a line ("flag goes up, {team} caught offside")
> **But none of that is live today.**

### Yellow / red cards

**Yellow card (caution)**:
- **Accumulation rule**: a **2nd yellow for the same player in the same match = red card** (sent off)
- Enters the timeline + commentary ("Yellow! The referee has cautioned {player}")
- Tactical fouls / time-wasting / dissent → common yellows

**Red card**:
- **Direct red** — serious foul (violent conduct, malicious foul, denial of an obvious goal-scoring opportunity), **very rare**
- **Second yellow** — the same player's 2nd yellow in the match → upgrades to a red, **sent off**
- Both cases are recorded in the system as a `red_card` event (commentary may mention "second yellow" but the event type is red)

**What happens after a red**:
- Player **leaves the pitch immediately**, **no** replacement (play 10 vs 11)
- Not every match sees a red — most are 11 vs 11
- Red-card events **enter the timeline** with a clear icon

**Frequency (reference)**:
- **Yellows**: a handful per match (both sides combined)
- **Reds**: **most matches have none**; the ones that do are rare, direct reds **rarer still**

### Injuries

Triggered in the match by tackles / overuse → the system classifies **mild / moderate / severe**:

- **Mild** — can keep playing, **reduced ability**
- **Moderate** — must leave the pitch, **auto-sub** from the bench (same position)
- **Severe** — must leave the pitch, **auto-sub** from the bench (same position)

See [Chapter 4](04-player-attributes.md) — "injury status" for the full breakdown. An injury does **not** always trigger a sub — **it depends on whether you have a same-position player on the bench**; if not, a moderate / severe injury is **treated as a send-off** (play with 10).

### Own goal

**How it happens**: a player on your side **puts the ball into your own net** while defending (clearance error, keeper spill, etc.).

**Timeline**: yes — it **shows as "own goal"**.

**Whose goal is it?**: it counts for the **opposition**, scoreboard updates like a normal goal.

**How to read it**: the player's event history logs a `goal` entry (tagged `own_goal`); it does **not** count toward that player's personal goal tally (own goals are not personal goals).

### Forfeit

**How it happens**: one side **can't field a team** (e.g. club dissolved, severe rule violation), the system awards 3-0 to the other side.

See [Chapter 6](06-match-basics.md) — "forfeit" for the full rules. Very rare.

---

## 3. Extra time + penalty shootout

### When they happen

**Not every match**:
- **League** — 90-minute draw → match ends, both teams get 1 point
- **Cup / playoff** — 90-minute draw → **go to extra time**
- **Friendly / tournament** — depends on the competition rules

### Extra time flow

```
90-minute draw
  ↓
Extra time first half (15 min, 91'-105')
  ↓
5-minute break
  ↓
Extra time second half (15 min, 106'-120')
  ↓
Still drawn → penalty shootout
```

The **same rules apply** during extra time (corners, free kicks, penalties, cards — all of it), just a shorter window.

### Penalty shootout

**How it works**:
- Each side **takes 5**, alternating (home team first)
- 5 rounds still drawn → **sudden death** (1 each, first to lead wins)
- **No player cap** — sudden death can run as long as needed

**Taker order**:
- The system **picks the next un-sent-off player in the squad order** (home team runs down the starting 11 by position, away team the same)
- **Not** "who has the best penalty skill" — different from in-match penalties (Section 1) which sort by `penalties` skill

**Are veterans still reliable?**:
**Yes**. The shootout uses the **same bonus** as in-match penalties — `form` + `experience` — so veterans are **more reliable** in the shootout too.

**How the stats count (key!)**:
- Shootout goals **count for the final result** (affects advancement / league points)
- **But** — they **don't** go into the player's personal goal tally (no `goal` entry in the player event history), only the match outcome is marked
- This is **different** from in-match penalties which do count personally

---

## 4. How special events connect to your players

### What you can influence indirectly

Set pieces / special events **can't be operated mid-match**, but **before kickoff** you can shape them through:

| Pre-match decision | What it affects |
|---|---|
| **Starting 11 + 6 bench** | The candidate pool for free-kick / penalty takers (auto-picked from it) |
| **Player's `freeKicks` / `penalties` skill** | Determines taker ranking — higher skill = more likely to be picked |
| **Player position (AM / CM vs others)** | Taker ranking has a **bonus** (AM / CM the highest) |
| **Player's `specialty`** | Modifies the matching events (see the table below) |
| **Tactics — defensive line height** | Attacking press / counter-exposure (offside logic not yet wired up, so it doesn't drive offside today) |
| **Bench config** | Whether moderate / severe injuries **can be auto-subbed** (have a sub = sub, no sub = send-off) |
| **GK's `SAVING_MASTER` specialty** | Penalty saves + key-save bonus |

### Which specialties hook into set pieces / special events

The 12 specialties are mostly "decision / attack / defense" bonuses, but a few have a **direct** link to set pieces / special events:

| Specialty | Triggers on these events |
|---|---|
| `SAVING_MASTER` | **GK penalty saves + key saves** (also active in the shootout) |
| `AERIAL_THREAT` | **Aerial duels in corners / free kicks** |
| `POACHER` | **Tap-ins / rebounds off set pieces** |
| `WALL` | **Defensive wall / block of opponent set-piece moves** |
| `COMPOSED` | **Penalty taking + 1v1 finishing** |

> The full 12 specialties + 3 tier strengths are covered in [Chapter 4](04-player-attributes.md) — "specialties" section and the `specialties-meaning` entry.

---

## 5. How to prepare for set pieces / special events

There is **no dedicated pre-match settings page** for set pieces / special events. What you **can** do is prepare indirectly:

1. **Pick the lineup** — favor players with high `freeKicks` / `penalties` (especially AM / CM) so they become the taker candidates
2. **Pick the GK** — favor a GK with `SAVING_MASTER` (GOLD > SILVER > BRONZE) for penalty defense
3. **Specialty mix** — possession-heavy system? Look for `POACHER` / `AERIAL_THREAT` / `COMPOSED`; counter-attack? Look for `SPEEDSTER`
4. **Bench config** — every same-position slot must have a sub, otherwise a moderate / severe injury is **a direct send-off** (10 men)
5. **Tactics — defensive line** — drives the **attacking press** vs **counter-exposure** trade-off (no offside effect today, see the "Offside" section above)

---

## 6. Common mistakes

❌ **"Why doesn't the corner enter the timeline?"** — corners are too frequent (8-12 per match), only the **goal** shows, not every delivery
❌ **"Why don't I see offside?"** — the **offside simulation isn't wired up yet**, so the referee never calls it, the FE shows nothing; the infrastructure is ready, it'll start working when the engine is connected
❌ **"Can we sub a red-carded player?"** — **no**. After a red the team **plays with 10**, the system **does not** auto-replace
❌ **"Is the 2nd yellow a yellow or a red?"** — it shows as a **red** (event type `red_card`), commentary may mention "second yellow"
❌ **"Do shootout goals count as personal stats?"** — **no**. They count for the result, **not** the player's goal tally
❌ **"Are veterans more reliable from the spot?"** — **yes**. Penalties only use `form` + `experience`, stamina doesn't apply, so the experience bonus is in full effect
❌ **"Can I pick the taker?"** — **no**. The system **auto-picks** by `penalties` / `freeKicks` skill + position bonus
❌ **"Did the GK play badly because he didn't save the penalty?"** — not necessarily — penalties are **high-scoring overall**, saves are rare; judge by **rate over many** kicks, not one
❌ **"High line = lots of offside = bad tactic?"** — today, a high line **does NOT trigger more offside** (the simulation isn't wired up yet); the real cost of the high line is **getting hit on the counter**
❌ **"Why is my mildly injured player performing poorly?"** — mild = can play but **reduced ability**, **not** a bug

---

## 7. How this connects to other concepts

| Concept | Connection |
|---|---|
| **Match basics** (Chapter 6) | Live event stream, timeline, commentary all include set pieces / special events |
| **Lineup** (Chapter 5) | Starting 11 + 6 bench = taker candidate pool + auto-sub candidates |
| **Player attributes** (Chapter 4) | `form` / `experience` / current stamina → drives set-piece performance (penalties only use form + exp) |
| **Specialties** (Chapter 4) | `SAVING_MASTER` / `AERIAL_THREAT` / `POACHER` etc. directly affect set pieces / special events |
| **Tactics** (Chapter 15) | Defensive line height drives the **attacking press / counter-exposure** trade-off (offside logic not yet wired up, so it doesn't drive offside today) |
| **Player event history** (`player-event-types` entry) | The player detail page's `goal` / `INJURY` / `HAT_TRICK` events do **not** include set-piece types, they only log personal milestones |

---

## Next

- [Chapter 4: Player Other Attributes](04-player-attributes.md) — how `form` / `experience` / stamina drive set-piece performance
- [Chapter 5: Lineup Basics](05-lineup-basics.md) — how to pick starters + bench (affects the set-piece candidate pool)
- [Chapter 6: Match Basics](06-match-basics.md) — live event stream and timeline
- [Chapter 15: Match Tactics](15-tactics.md) — how defensive line height drives the match (today: attacking press / counter-exposure; offside logic not yet wired up)
