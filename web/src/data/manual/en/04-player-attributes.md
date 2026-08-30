---
order: 4
slug: player-attributes
title: Player Other Attributes
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 5, 18, 19]
relatedEntries: [pwi-vs-overall, current-vs-potential-skills, potential-tier-meaning, experience-meaning, specialties-meaning, condition-form-injury]
---

# Player Other Attributes

Skills (chapter 2) and positions (chapter 3) are the player's "hard metrics", but on-pitch performance is also shaped by a set of **other attributes**. This chapter covers the "soft metrics":

- **PWI / overall** — the aggregate score (combines hard + soft metrics into one number)
- **currentSkills vs potentialSkills** — the two lines on the radar chart (solid vs dashed)
- **potentialTier** — a 5-tier potential label
- **form** — short-term state
- **experience / level** — long-term "seasoning"
- **condition / stamina** — in-match energy
- **injury** — fitness status
- **specialties** — 12 types, 3 tiers (GOLD / SILVER / BRONZE)
- **age** — age (no decay mechanic; affects long-term planning)

> These attributes are **orthogonal** to skills (chapter 2) and positions (chapter 3) — a player can have a sky-high PWI but be injured (form doesn't help), or have maxed skills but be 35 (high experience but the decay system has already kicked in).

---

## PWI / overall — the aggregate score

**PWI = Player Worth Index** = the player's overall score. You see it next to the radar chart, on the player card, in the transfer market, in scout reports.

**Relation to overall**: **PWI = overall**. The API returns both fields with identical values. `pwiDisplay` is the UI's rounded-to-10 form (e.g. 4772 → 4770).

**PWI is shaped by three factors** (qualitative):

1. **currentSkills** — the dominant factor. High headline skills → high PWI
2. **potentialAbility** — an amplifier. At the same skill levels, a high-potential player has a higher PWI ceiling (a low-potential player tops out no matter how much they train)
3. **form** — a fine-tuning factor. High form nudges PWI up, low form nudges it down

> **High PWI ≠ guaranteed good performance on the pitch**. Two players with the same PWI, deployed in different positions, will produce wildly different results (position weights differ). Always read PWI together with **position** ([chapter 3](03-positions.md)).

**When to look at PWI**:
- Transfer market comparison (higher PWI → higher starting price / wage)
- Scout reports (the PWI range the scout gives is a quick way to gauge a player's bracket)
- Squad overview (scan the PWI distribution of your core players at a glance)

---

## currentSkills vs potentialSkills — the radar's two lines

On the radar chart each skill has **two lines**:
- **Solid line** = `currentSkills` (current ability — what shows on the pitch right now)
- **Dashed line** = `potentialSkills` (ceiling — skills stop growing here)

**The gap between the two lines = how much room is left to grow**:
- **senior players**: the two lines almost overlap (already grown)
- **youth players**: big gap (still growing, 0-2 skills may tick up each week)

Skills stop growing when they hit `potentialSkills` (won't exceed the dashed line). **The potential values are fixed by potentialAbility**; once `currentSkills` hits the cap, that's it.

**How they grow**:
- **Matches** — the engine awards +1 to skills after matches based on in-match contribution (within the potential range)
- **Training** — Thursday weekly training tick by category
- **Youth reveal** — youth players get a chess-style reveal of one skill per week (fogged skills must be revealed before they can grow)

See [chapter 2](02-player-skills.md) "how skills grow" for details.

---

## potentialTier — the 5-tier potential bracket

A 5-tier potential label. It is **independent of current ability** and represents the player's **ceiling**:
- **LOW** (grey) — low potential; maxed out they're still mostly a sub
- **REGULAR** (green) — standard; typical outfield starter level
- **HIGH_PRO** (gold) — high potential; maxed out they're top-tier

**HIGH_PRO is not the same as the 21-tier label**:
- **potentialTier** is a 5-tier "potential bracket", shown on the player card's "potential" slot
- **tier label** is a 21-tier "current skill / experience bracket", shown next to each skill on the radar
- **They look similar but are different systems** — don't mix them up

> For youth players, potentialTier is fogged by `revealLevel` — you need to reveal enough skills before the label becomes visible.

---

## form — short-term state

**form = short-term state**, affects the PWI display and on-pitch performance. Range **0-5**, default **3.0**, with 3.0 as the baseline.

**How to read it**:
- The radar chart / player card shows a "state arrow" (`↑ / → / ↓`)
- High form → PWI displays a bit higher / better on-pitch performance
- Low form → PWI displays a bit lower / worse on-pitch performance

**How form changes**:
- **Matches** — good performances push it up, bad ones push it down
- **Training** — training can affect it
- **Cumulative match minutes** — long stretches without playing make form drop

**When form matters**:
- **Short-term decisions** (pushing for the title this season) → form is critical, buy by form
- **Long-term decisions** → form's natural noise can be ignored; look at potential + experience

---

## experience / level — long-term "seasoning"

**experience = cumulative XP**, earned after every match. **Level** = `getExperienceLevel(totalExp)`, starting from 0, **no upper cap**.

**Leveling cost** (`getExperienceUpgradeCost`): **linear**, +2 XP per level
- L0 → L1 needs 10 XP
- L1 → L2 needs 12 XP
- L2 → L3 needs 14 XP
- ...
- L5 → L6 needs 20 XP
- ...

**The 21-tier label**: once experience crosses certain thresholds, the matching tier displays (see [appendix 3](A3-tier-labels.md) for the full table). **Display caps at L20** — the internal level can keep climbing, but the tier label never goes above `L20 transcendent`.
- Hover for the raw XP
- Past L20, every player looks like "transcendent" in the UI; raw XP is how you tell them apart

**How experience grows** (multiplier by match type):
- National team **5x** (fastest, capped at 5 league matches worth)
- Playoff 2x
- League / cup 1x (baseline)
- Friendly 0.1x (almost no growth)
- Tournament 0 (doesn't count)

Playing a full 90 minutes = full base XP; 45 minutes = half; 10 minutes off the bench = nearly nothing.

**The veterans' bonus** (why high experience is valuable):
- The engine uses **raw XP** (not the tier label) to compute the multiplier
- Both `calculatePenaltyMultiplier` and `getMultiplierWithFitnessFactor` use raw XP
- **Official note**: "Penalty specific multiplier: Ignores stamina, high experience bonus."
- **Bottom line**: **veterans are more reliable from the spot** — they aren't affected by stamina

See [appendix 3](A3-tier-labels.md) "how to read — experience" for details.

---

## condition / stamina — in-match energy

**condition = current energy during a match**, **stamina = the starting energy at kickoff**.

**Lifecycle**:
- At kickoff stamina = 100%
- Continuously drained during the match (running, duels, saves, actions all cost energy)
- Low energy hurts on-pitch performance (penalty below a threshold; threshold not disclosed)
- **Halftime break** (15 min) **does not restore** energy
- A substituted-on player starts at **100% energy**
- After the match: **stamina resets to 100%** (fresh for the next one)

**How to read it**:
- During a live match, the player card shows an **energy bar** (green / yellow / red)
- Updates in real time — no need to consult the radar

**How condition differs from form / experience**:
- condition is **within a match** (affects the current game)
- form is **across matches** (affects PWI)
- experience is **long-term** (drives the veterans' bonus)

---

## injury — fitness status

A player has a **current injury state** (`injuryState` field), with **3 states**:

| State | Meaning | Behaviour |
|---|---|---|
| `null` / healthy | not injured | plays normally |
| `minor` | minor injury | can play, **ability reduced** |
| `severe` | major injury | **cannot play** |

**Injury types** (`injuryType`, 5 kinds):
- `muscle` (muscle)
- `ligament` (ligament)
- `joint` (joint)
- `head` (head)
- `other` (other)

**Severity** = `currentInjuryValue` (int, internal engine field, **not displayed**):
- minor = a few days to recover
- severe = a few weeks to recover
- The engine counts down the value daily

**How injuries happen**:
- Triggered by match events (tackles, overuse, etc.)
- Long stretches without rest can accumulate

**How to read / use injuries**:
- Player card / detail page shows the "injury" status
- A severe injury **locks the player out of the starting XI** (lineup buttons are disabled)
- Major injuries generate an "injury record" event (`INJURY` event)

**Practical implications**:
- Before buying, check the injury history (lots of `INJURY` events = injury-prone, be careful)
- On matchday, a severe injury forces a substitution
- For minor injuries, it's your call whether to play them (the ability hit = the risk)

---

## specialties — 12 types, 3 tiers

**specialties = the player's "identity tags"**, which trigger engine bonuses on specific match events. **12 active specialties**, each with an engine hook.

### 12 specialties (best positions / trigger event)

| Specialty | Best positions | Trigger event |
|---|---|---|
| `AERIAL_THREAT` | CB / CF | headers, aerial duels |
| `DRIBBLER` | W / AM | 1v1 dribble past |
| `PLAYMAKER` | AM / CM | through balls, final pass |
| `TACKLER` | CB / DM | tackles, sliding tackles |
| `WALL` | CB / DM | defensive blocks |
| `SPEEDSTER` | W | counter-attack runs |
| `CROSSER` | W / fullback | flank crosses |
| `POACHER` | CF | tap-ins, poaching |
| `COMPOSED` | CF / AM | one-on-one finishes |
| `PHYSICAL_BEAST` | CB / CF | physical duels |
| `SAVING_MASTER` | GK | key saves |
| `SWEEPER_KEEPER` | GK | sweeper actions |

**3 tiers**:
- **GOLD** — biggest bonus
- **SILVER** — medium bonus
- **BRONZE** — smallest bonus

**Key facts about specialties**:
- **~50% of players have no specialty** (the other half are randomly assigned one)
- **Tier is independent of skills** — set at generation, fixed for life
- **Only the strongest counts per match** — if your team has multiple of the same specialty, only the strongest one applies
- **Synergy with position / tactics** — a specialty that matches the player's role is a bonus

**Practical implications**:
- Headline skill + strong specialty = a real core player
- GOLD specialties command a price premium
- When scouting for a specific position, look for the **best-fit specialty**:
  - W: `DRIBBLER` / `SPEEDSTER` / `CROSSER`
  - CB: `TACKLER` / `AERIAL_THREAT` / `WALL` / `PHYSICAL_BEAST`
  - AM: `PLAYMAKER` / `DRIBBLER` / `COMPOSED`
  - CF: `POACHER` / `AERIAL_THREAT` / `COMPOSED` / `PHYSICAL_BEAST`
  - GK: `SAVING_MASTER` / `SWEEPER_KEEPER`

---

## age — age (no decay mechanic)

**`age` field = the player's age** (integer, computed from `createdDay`).

**Key fact**: **GoalXI currently has no age-based decay mechanic**. A 35+ veteran will **not** lose skills just because they're old — only the "35+ decay" system mentioned in [chapter 2](02-player-skills.md) (runs Monday in the background) is in play, and that is not the same as age itself decaying.

**How age relates to other attributes**:
- **Positive correlation with experience** — the longer they've played, the more XP (veteran = high experience)
- **No direct relationship with PWI / skills** (the decay system is age-triggered, but only the "35+" switch is wired)
- **No direct relationship with form**

**Age's only roles**:
- Shown on the player card / detail page (so you know how "old" a player is)
- Triggers the 35+ decay system switch (background)
- A long-term planning reference (young = still has potential, old = in the veterans' bonus window)

> **GoalXI's age system is not like Hattrick / FM** where older players automatically lose attributes. As long as a veteran isn't injured and form holds, they're just as dangerous on the pitch.

---

## 11-attribute overview

| Attribute | Type | Impact | How it grows / drops | Where to see it |
|---|---|---|---|---|
| **PWI** | aggregate | overall player rating (transfers, scouts, squad overview) | 3 factors: skills + potential + form | player card, transfer market, next to radar |
| **currentSkills** | current | on-pitch performance | matches + training | radar solid line |
| **potentialSkills** | potential | skill ceiling | fixed at birth | radar dashed line |
| **potentialTier** | 5-tier label | long-term value judgement | fixed | player card "potential" slot |
| **form** | short-term state | PWI display + on-pitch performance | matches / training / cumulative minutes | player card "state arrow" |
| **experience** | long-term accrual | PWI factor + veterans' bonus | matches (5x national / 2x playoff / 1x league / 0.1x friendly) | player card "EXP" + 21-tier label |
| **condition** | in-match energy | current-game performance | drained by matches / restored by subs | live-match energy bar |
| **injury** | fitness status | playable / ability | triggered by match events / recovery countdown | player card "injury" slot |
| **specialties** | specialty | event-trigger bonus | fixed at birth | player card "specialty" slot |
| **age** | number | triggers the 35+ decay system | fixed (computed from `createdDay`) | player card "age" slot |
| **nationality** | ISO country code | national team / style tendency | fixed | player card "nationality" slot (currently **no effect**) |

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Skills** (chapter 2) | headline skills + potential + form = PWI; the currentSkills vs potentialSkills gap |
| **Positions** (chapter 3) | high PWI ≠ good at every position, position weights differ |
| **Tier labels** (appendix 3) | experience uses the 21-tier label for display, capped at L20 |
| **potentialTier 5-tier** (this chapter) | **not the same system** as the 21-tier label, don't mix them up |
| **Special events** (chapter 6) | `INJURY` event + 14 other event types like `HAT_TRICK` |
| **Transfers** (chapter 18) | when buying, look at PWI + injury history + form + potentialTier |
| **Youth** (chapter 19) | youth players get skill reveal + form drift |

---

## Common mistakes (about attributes)

❌ **"High PWI = strong player"**: **a high PWI is just a high aggregate score** — if the headline skill doesn't match the position, the player disappears on the pitch
❌ **"Ignoring the potentialSkills gap"**: **high potential doesn't mean they can still grow** — read the gap between currentSkills and potentialSkills
❌ **"Chasing the perfect player"**: **LEGEND + maxed skills + healthy + young + cheap = doesn't exist**
❌ **"Ignoring form swings"**: **form < 1.5 = buy cheap** (post-injury recovery, may bounce back)
❌ **"Mixing up potentialTier and the 21-tier label"**: **5-tier potential ≠ 21-tier current tier, two separate systems**
❌ **"Assuming age = decay"**: **age itself has no decay mechanic**, the decay system is a "35+" switch
❌ **"Judging a GK by pace / strength / set pieces"**: **irrelevant** (the GK scoring path doesn't use these)
❌ **"Playing through a minor injury like nothing"**: **ability is reduced**, don't gamble in key matches
❌ **"Only chasing GOLD specialties"**: **no specialty + high headline > GOLD specialty + low headline**

---

## Next

- [chapter 2: Player Skills](02-player-skills.md) — how skills grow / drop
- [chapter 3: Player Positions](03-positions.md) — 14 positions + headline skills
- [chapter 5: Lineup Basics](05-lineup-basics.md) — how to use these attributes when building a lineup
- [chapter 6: Match Basics](06-match-basics.md) — how these attributes play out in a match
- [chapter 18: Transfer Market](18-transfer.md) — which attributes to look at when buying
- [chapter 19: Youth Players](19-youth.md) — youth reveal / form drift
- [appendix 3: Player Tier Labels](A3-tier-labels.md) — the full 21-tier table
