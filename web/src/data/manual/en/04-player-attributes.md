---
order: 4
slug: player-attributes
title: Player Other Attributes
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 5, 18]
relatedEntries: [current-vs-potential-skills, potential-tier-meaning, experience-meaning, specialties-meaning, condition-form-injury]
---

# Player Other Attributes

Skills (chapter 2) and positions (chapter 3) are the player's "hard metrics", but on-pitch performance is also **directly shaped by a set of other attributes**. This chapter covers the "soft metrics", and focuses on explaining **what each attribute actually does inside a match**:

- **PWI** — the aggregate score (for comparison, scout reports, squad overview)
- **currentSkills vs potentialSkills** — the two lines on the radar chart
- **potentialTier** — a potential bracket (LOW / REGULAR / HIGH_PRO / ELITE / LEGEND)
- **form** — a real-time **multiplier on every key in-match event**
- **experience** — a long-term **multiplier on every key in-match event**
- **stamina / in-match current energy** — the in-match energy curve; **exponential decay** when overdrawn
- **injury** — fitness status (gates availability)
- **specialties** — 12 types, 3 tiers (GOLD / SILVER / BRONZE)
- **age** — age (currently only triggers the 35+ decay system)

> **The core idea**: **form, experience, and stamina together determine a performance multiplier that applies to almost every match event** — goals, assists, tackles, saves, key passes, dribbles... The PWI is only a **pre-match estimate**; what actually happens on the pitch is governed by these three.

---

## PWI — the aggregate score

**PWI = Player Worth Index** = the player's overall score. You see it next to the radar chart, on the player card, in the transfer market, in scout reports.

**PWI is shaped by three factors** (qualitative):

1. **currentSkills** — the dominant factor. High headline skills → high PWI
2. **potential** (potential bracket + per-skill ceiling) — an amplifier. At the same skill levels, a high-potential player has a higher PWI ceiling (a low-potential player tops out no matter how much they train)
3. **form** — a fine-tuning factor. High form nudges PWI up, low form nudges it down

> **High PWI ≠ guaranteed good performance on the pitch**. Two players with the same PWI, deployed in different positions, will produce wildly different results (position weights differ). Always read PWI together with **position** ([chapter 3](03-positions.md)).

**PWI display**: an integer (e.g. `4770`), shown as a whole number in the UI.

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
- **Developed players**: the two lines almost overlap (already at ceiling)
- **Undeveloped players**: big gap (still growing)

Skills stop growing when they hit `potentialSkills` (won't exceed the dashed line). **The potential values are fixed by the player's potential**; once `currentSkills` hits the cap, that's it.

**How they grow**:
- **Matches** — the engine awards +1 to skills after matches based on in-match contribution (within the potential range)
- **Training** — Thursday weekly training tick by category

See [chapter 2](02-player-skills.md) "how skills grow" for details.

---

## potentialTier — the potential bracket

A potential label (low → high): **LOW / REGULAR / HIGH_PRO / ELITE / LEGEND**. It is **independent of current ability** and represents the player's **ceiling**.

- **LOW** (grey) — low potential; maxed out they're still mostly a sub
- **REGULAR** (green) — standard; typical outfield starter level
- **HIGH_PRO** (gold) — high potential; maxed out they're top-tier
- **ELITE** (red-gold) — elite potential, extremely rare
- **LEGEND** (purple) — generational, almost never seen

**Note: `potentialTier` is a different system from the tier label shown on the radar / experience badge**:
- **potentialTier** = the potential bracket, shown on the player card's "potential" slot
- **tier label** = the skill / experience grade, shown next to each skill on the radar and on the experience badge
- **They sound similar but are different systems** — don't mix them up

---

## form — short-term state (what it does in a match)

**form = short-term state**, **directly affects the player's real-time performance in every match**. Range **0-5**, default **3.0**, with 3.0 as the baseline.

### What form does in a match

For every match, the engine computes a **status multiplier from `form`** and applies it to the final score of **almost every match event** — goals, assists, tackles, saves, key passes, dribbles, aerial duels, etc.:
- `form > 3.0` → status multiplier > 1 (key events get a proportional boost)
- `form = 3.0` → neutral (baseline)
- `form < 3.0` → status multiplier < 1 (key events get a proportional cut)

**Bottom line**: **a high-form player's event scores are systematically higher**. Two players with the same skills, same position, but form 5.0 vs form 1.0 — the first will systematically outscore the second on goals, saves, and other key events.

### How form changes

- **Matches** — good performances push it up, bad ones push it down
- **Training** — training can affect it
- **Long stretches without playing** — the engine tracks cumulative minutes since last appearance; form drops when that counter gets too high

### How form relates to PWI

PWI display also factors in form (high form → PWI displays a bit higher, low form → a bit lower), but **PWI is only an estimate** — the real role of form is the per-event multiplier inside the match.

### How to read it

- The radar chart / player card shows a "state arrow" (`↑ / → / ↓`)

### When form matters

- **Short-term decisions** (pushing for the title this season) → form is critical, buy by form
- **Long-term decisions** → form's natural noise can be ignored; look at potential + experience

---

## experience / level — long-term "seasoning" (what it does in a match)

**experience = cumulative XP**, earned after every match. **Level** = `getExperienceLevel(totalExp)`, starting from 0, **no upper cap on level** (the L20 display cap is documented in [appendix 3](A3-tier-labels.md)).

### What experience does in a match

For every match, the engine computes an **experience multiplier from `experience`** and applies it to the final score of **almost every match event** — goals, assists, tackles, saves, key passes, etc.:
- **0 XP → experience multiplier = 1.0** (neutral, no bonus)
- **High XP → experience multiplier > 1** (key events get a proportional boost)
- **Hyperbolic saturation** — the more experience, the bigger the boost, but with **diminishing returns at the top end** (the curve flattens as you accumulate)
- **No hard cap** (the L20 display caps, but internal XP keeps growing, and the multiplier keeps approaching the asymptote — just ever more slowly)

**Bottom line**: **high-experience players have systematically better event scores**. Same skills, same position, but an old head vs a rookie — the veteran is reliably better on key events.

### Leveling cost (`getExperienceUpgradeCost`)

**Linear**, +2 XP per level:
- L0 → L1 needs 10 XP
- L1 → L2 needs 12 XP
- L2 → L3 needs 14 XP
- ...
- L5 → L6 needs 20 XP
- ...

### The tier label

Once experience crosses certain thresholds, the matching tier displays (see [appendix 3](A3-tier-labels.md) for the full table). **Display caps at L20** — the internal level can keep climbing, but the tier label never goes above `L20 transcendent`.
- Hover for the raw XP
- Past L20, every player looks like "transcendent" in the UI; raw XP is how you tell them apart

### How experience grows (multiplier by match type)

- National team **5x** (fastest growth)
- Playoff 2x
- League / cup 1x (baseline)
- Friendly 0.1x (almost no growth)
- Tournament 0 (doesn't count)

Playing a full 90 minutes = full base XP; 45 minutes = half; 10 minutes off the bench = nearly nothing.

### The veterans' penalty bonus (why experience is valuable)

Penalties use a **dedicated multiplier** (`ConditionSystem.calculatePenaltyMultiplier`) that looks at **form + experience only, ignoring stamina**:
- Engine comment (verbatim): "Penalty specific multiplier: Ignores stamina, high experience bonus."
- **Bottom line**: **veterans are more reliable from the spot** — they aren't affected by stamina, and the experience bonus still applies

### Why experience is long-term value

- Experience is **non-reversible** (never decreases)
- It grows **every match** (even 1 minute off the bench)
- Older players accumulate more experience → more reliable on key events
- PWI display also factors in experience (one of the PWI factors), but PWI is only an estimate; the real role of experience is the per-event multiplier inside the match

---

## stamina / in-match current energy — the in-match energy curve (what it does in a match)

**Two concepts to keep separate**:
- **stamina** = the player's "**stamina pool**" attribute (the `stamina` field on the player card, 1-6 range, default 3.0)
- **in-match current energy** = the runtime remaining energy **during a single match** — it exists only while a match is in progress

### In-match current energy lifecycle

| Phase | Behaviour |
|---|---|
| Kickoff | current energy = `stamina` attribute (full tank every match) |
| During the match | continuously drained (running, duels, saves, actions all cost energy) |
| Halftime (15 min) | **partial recovery** (a small amount) |
| Substitution | **incoming player's current energy = `stamina` attribute** (full tank) |
| After the match | current energy is discarded; player returns to "full" for the next match |

### What in-match current energy does in the engine

For every match, the engine computes a **fitness multiplier from current energy** (`ConditionSystem.calculateMultiplier`'s `fitnessFactor`):
- **Energy plentiful** (consumption not yet past the "free buffer") → fitness multiplier = 1.0 (**peak performance**; on-pitch actions unaffected)
- **Overdrawn** (consumption past the free buffer) → fitness multiplier **decays exponentially** — the more overdrawn, the steeper the drop
- The engine intentionally gives a "free buffer" zone: until consumption hits that threshold, **performance does not decay** (gives players a "warm-up window" before the penalty kicks in)

**Bottom line**:
- **Full energy at kickoff** → on-pitch performance is unaffected (multiplier = 1.0)
- **Drained by the 80th minute** → performance degrades sharply
- **A halftime sub coming on** → 100% energy, fitness multiplier = 1.0 (great for late-game attacks)

### The stamina attribute itself

- **stamina does NOT permanently drop from match consumption** — it's a "talent" that defines the **starting energy pool** and the **free buffer size** for every match
- **High-stamina players** = bigger pool, bigger buffer, **more fatigue-resistant** → less likely to collapse late in the match
- Between matches, the stamina attribute **does not change** (it's a talent, not a current state)

### How to read it

- During a live match, the player card shows an **energy bar** (green / yellow / red) — this is the in-match current energy
- Updates in real time — no need to consult the radar
- The stamina attribute itself is shown on the player card / radar under the "stamina" label

### How stamina differs from form / experience

- **stamina** = the player's **stamina talent** (kickoff starting point)
- **in-match current energy** = this-match's remaining energy (transient)
- **form** = **cross-match short-term state** (affects every action)
- **experience** = **long-term** accrual (affects every action)
- In the match, all three combine: `performance multiplier = fitnessFactor × statusFactor × expFactor`

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

| Attribute | Type | What it does in a match | What it does outside matches | Where to see it |
|---|---|---|---|---|
| **PWI** | aggregate | (not directly used in matches — pre-match estimate) | transfer comparison, scout reports, squad overview | player card, transfer market, next to radar |
| **currentSkills** | current | **base score** for key events (then multiplied by form / experience / stamina) | radar solid line | radar solid line |
| **potentialSkills** | ceiling | (not directly used — sets where currentSkills tops out) | radar dashed line | radar dashed line |
| **potentialTier** | potential bracket | (not directly used) | long-term value judgement | player card "potential" slot |
| **form** | short-term state | **status multiplier** on all key events | mild PWI display nudge | player card "state arrow" |
| **experience** | long-term accrual | **experience multiplier** (hyperbolic saturation) on all key events; penalties use form + exp **only**, not stamina | PWI factor; tier badge | player card "EXP" + tier label |
| **stamina** | player talent | sets the per-match **starting energy pool + free buffer** (high stamina = fatigue-resistant) | player card "stamina" label | player card stamina |
| **in-match current energy** | runtime (transient) | **fitness multiplier** — full energy = 1.0, overdrawn = **exponential decay** | (not persistent) | live-match energy bar |
| **injury** | fitness status | minor = ability reduced, severe = cannot play | locks starting XI / `INJURY` event | player card "injury" slot |
| **specialties** | specialty | engine bonus on specific events | player card "specialty" slot | player card "specialty" slot |
| **age** | number | (not directly used) | triggers 35+ decay system; long-term planning reference | player card "age" slot |

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Skills** (chapter 2) | headline skills + potential + form = PWI; the currentSkills vs potentialSkills gap |
| **Positions** (chapter 3) | high PWI ≠ good at every position, position weights differ |
| **Tier labels** (appendix 3) | experience uses the tier label for display, capped at L20 |
| **potentialTier** (this chapter) | **not the same system** as the tier label, don't mix them up |
| **Match events** (chapter 6) | form / experience / stamina multipliers apply to almost every match event |
| **Special events** (chapter 6) | `INJURY` event + 14 other event types like `HAT_TRICK` |
| **Transfers** (chapter 18) | when buying, look at PWI + injury history + form + potentialTier + stamina (fatigue resistance) |

---

## Common mistakes (about attributes)

❌ **"High PWI = strong player"**: **a high PWI is just a high aggregate score** — if the headline skill doesn't match the position, the player disappears on the pitch
❌ **"Ignoring the potentialSkills gap"**: **high potential doesn't mean they can still grow** — read the gap between currentSkills and potentialSkills
❌ **"Chasing the perfect player"**: **LEGEND + maxed skills + healthy + young + cheap = doesn't exist**
❌ **"Ignoring form swings"**: **form < 1.5 = buy cheap** (post-injury recovery, may bounce back)
❌ **"Mixing up potentialTier and the tier label"**: **potential bracket ≠ skill/experience grade, two separate systems**
❌ **"Assuming age = decay"**: **age itself has no decay mechanic**, the decay system is a "35+" switch
❌ **"Judging a GK by pace / strength / set pieces"**: **irrelevant** (the GK scoring path doesn't use these)
❌ **"Playing through a minor injury like nothing"**: **ability is reduced**, don't gamble in key matches
❌ **"Only chasing GOLD specialties"**: **no specialty + high headline > GOLD specialty + low headline**
❌ **"Using a rookie like a veteran"**: **0 experience → experience multiplier = 1.0 (no bonus)**, same skills but a veteran is more reliable on key events
❌ **"Ignoring low-stamina players"**: **low stamina → small buffer → late-match collapse**, be careful in key games

---

## Next

- [chapter 2: Player Skills](02-player-skills.md) — how skills grow / drop
- [chapter 3: Player Positions](03-positions.md) — 14 positions + headline skills
- [chapter 5: Lineup Basics](05-lineup-basics.md) — how to use these attributes when building a lineup
- [chapter 6: Match Basics](06-match-basics.md) — how these attributes play out in a match
- [chapter 18: Transfer Market](18-transfer.md) — which attributes to look at when buying
- [appendix 3: Player Tier Labels](A3-tier-labels.md) — the full tier label table
