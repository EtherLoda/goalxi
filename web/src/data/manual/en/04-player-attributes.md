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
- **form** — short-term state, affects **every key in-match event**
- **experience** — long-term accrual, affects **every key in-match event**
- **stamina** — the player's stamina talent
- **in-match current energy** — remaining energy during a match (the energy bar)
- **injury** — fitness status (gates availability)
- **specialties** — 12 types, in GOLD / SILVER / BRONZE tiers
- **age** — age (currently has no direct effect on in-match performance)

> **The core idea**: **form, experience, and in-match current energy together determine the player's per-event performance on almost every match event** — goals, assists, tackles, saves, key passes, dribbles... The PWI is only a **pre-match estimate**; what actually happens on the pitch is governed by these three.

---

## PWI — the aggregate score

**PWI = Player Worth Index** = the player's overall score. You see it next to the radar chart, on the player card, in the transfer market, in scout reports.

**PWI is shaped by three factors** (qualitative):

1. **currentSkills** — the dominant factor. High headline skills → high PWI
2. **potential** — an amplifier. At the same skill levels, a high-potential player has a higher PWI ceiling (a low-potential player tops out no matter how much they train)
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
- **Developed players**: the two lines almost overlap (already at ceiling)
- **Undeveloped players**: big gap (still growing)

Skills stop growing when they hit `potentialSkills` (won't exceed the dashed line). **The potential values are fixed by the player's potential**; once `currentSkills` hits the cap, that's it.

**How they grow**:
- **Matches** — awards +1 to skills after matches based on in-match contribution (within the potential range)
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

## form — short-term state

**form = short-term state**, **directly affects the player's real-time performance in every match**. Range **0-5**, default **3.0**, with 3.0 as the baseline.

### What form does in a match

For every match, form determines a **status bonus** that's applied to the final outcome of **almost every match event** — goals, assists, tackles, saves, key passes, dribbles, aerial duels, etc.:
- `form > 3.0` → bonus > 1 (key events get a proportional boost)
- `form = 3.0` → neutral (baseline)
- `form < 3.0` → bonus < 1 (key events get a proportional cut)

**Bottom line**: **a high-form player's event outcomes are systematically better**. Two players with the same skills, same position, but form 5.0 vs form 1.0 — the first will systematically outscore the second on goals, saves, and other key events.

### How form changes

- **Matches** — good performances push it up, bad ones push it down
- **Training** — training can affect it
- **Long stretches without playing** — form drops

### How form relates to PWI

PWI display also factors in form (high form → PWI displays a bit higher, low form → a bit lower), but **PWI is only an estimate** — the real role of form is the per-event bonus inside the match.

### How to read it

- The radar chart / player card shows a "state arrow" (`↑ / → / ↓`)

### When form matters

- **Short-term decisions** (pushing for the title this season) → form is critical, buy by form
- **Long-term decisions** → form's natural noise can be ignored; look at potential + experience

---

## experience / level — long-term "seasoning"

**experience = cumulative XP**, earned after every match. **Level** starts from 0, **no upper cap on level** (the L20 display cap is documented in [appendix 3](A3-tier-labels.md)).

### What experience does in a match

For every match, experience determines an **experience bonus** that's applied to the final outcome of **almost every match event** — goals, assists, tackles, saves, key passes, etc.:
- **0 XP → bonus is neutral** (no boost)
- **High XP → bonus > 1** (key events get a proportional boost)
- **Diminishing returns** — the more experience, the bigger the boost, but with **slowing growth at the top end** (the curve flattens as you accumulate)
- **No hard cap** (the L20 display caps, but internal XP keeps growing, and the bonus keeps approaching the asymptote — just ever more slowly)

**Bottom line**: **high-experience players have systematically better event outcomes**. Same skills, same position, but an old head vs a rookie — the veteran is reliably better on key events.

### Leveling cost

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

Penalties use a **dedicated bonus** that looks at **form + experience only, ignoring in-match current energy**:
- **Bottom line**: **veterans are more reliable from the spot** — they aren't affected by stamina, and the experience bonus still applies

### Why experience is long-term value

- Experience is **non-reversible** (never decreases)
- It grows **every match** (even 1 minute off the bench)
- Older players accumulate more experience → more reliable on key events
- PWI display also factors in experience (one of the PWI factors), but PWI is only an estimate; the real role of experience is the per-event bonus inside the match

---

## stamina / in-match current energy — the in-match energy curve

**Two concepts to keep separate**:
- **stamina** = the player's "**stamina talent**", shown on the player card / radar
- **in-match current energy** = the **remaining energy** during a match, shown on the live-match energy bar

### In-match current energy lifecycle

| Phase | Behaviour |
|---|---|
| Kickoff | current energy = `stamina` talent (full tank every match) |
| During the match | continuously drained (running, duels, saves, actions all cost energy) |
| Halftime (15 min) | **partial recovery** (a small amount) |
| Substitution | **incoming player's current energy = `stamina` talent** (full tank) |
| After the match | current energy is discarded; player returns to "full" for the next match |

### What in-match current energy does on the pitch

For every match, current energy determines an **energy bonus**:
- **Energy plentiful** (consumption not yet past the "warm-up window") → bonus is neutral at 1.0 (**peak performance**; on-pitch actions unaffected)
- **Overdrawn** → bonus **drops sharply**, more drain = faster drop
- There's an intentional "warm-up window" at the start: until consumption passes that point, **performance does not decay** (gives players an early-match protection window)

**Bottom line**:
- **Full energy at kickoff** → on-pitch performance is unaffected
- **Drained by the second half** → performance drops sharply
- **A halftime sub coming on** → 100% energy, energy bonus is neutral (great for late-game attacks)

### The stamina talent itself

- **stamina does NOT permanently drop from match consumption** — it's a "talent" that defines the **starting energy pool** and the **fatigue resistance** for every match
- **High-stamina players** = bigger pool, **more fatigue-resistant** → less likely to collapse late in the match
- Between matches, the stamina talent **does not change** (it's a talent, not a current state)

### How to read it

- During a live match, the player card shows an **energy bar** (green / yellow / red) — this is the in-match current energy
- Updates in real time — no need to consult the radar
- The stamina talent itself is shown on the player card / radar under the "stamina" label

### How stamina differs from form / experience

- **stamina talent** = the player's **stamina ceiling** (kickoff starting point)
- **in-match current energy** = this-match's remaining energy (transient)
- **form** = **cross-match short-term state** (affects every action)
- **experience** = **long-term** accrual (affects every action)

---

## injury — fitness status

A player has a **current injury** state, **3 types**:

| State | Meaning | Behaviour |
|---|---|---|
| healthy | not injured | plays normally |
| `minor` | minor injury | can play, **ability reduced** |
| `severe` | major injury | **cannot play** |

**Injury types** (5 kinds):
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
- Major injuries generate an "injury record" event

**Practical implications**:
- Before buying, check the injury history (lots of injury record events = injury-prone, be careful)
- On matchday, a severe injury forces a substitution
- For minor injuries, it's your call whether to play them (the ability hit = the risk)

---

## specialties — 12 types, in GOLD / SILVER / BRONZE tiers

**specialties = the player's "identity tags"**, which trigger bonuses on specific match events. **12 types**, each linked to a class of events.

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

**Tiers**:
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

## age — age

**`age` = the player's age** (integer).

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

## Attribute overview

| Attribute | Type | What it does in a match | What it does outside matches | Where to see it |
|---|---|---|---|---|
| **PWI** | aggregate | (not directly used in matches — pre-match estimate) | transfer comparison, scout reports, squad overview | player card, transfer market, next to radar |
| **currentSkills** | current | **base score** for key events (then modified by form / experience / current energy bonuses) | radar solid line | radar solid line |
| **potentialSkills** | ceiling | (not directly used — sets where currentSkills tops out) | radar dashed line | radar dashed line |
| **potentialTier** | potential bracket | (not directly used) | long-term value judgement | player card "potential" slot |
| **form** | short-term state | **status bonus** on all key events | mild PWI display nudge | player card "state arrow" |
| **experience** | long-term accrual | **experience bonus** (diminishing returns) on all key events; penalties use form + exp **only**, not current energy | PWI factor; tier badge | player card "EXP" + tier label |
| **stamina** | player talent | sets the per-match **starting energy pool + fatigue resistance** | player card "stamina" label | player card stamina |
| **in-match current energy** | in-match (transient) | **energy bonus** — full energy = neutral, overdrawn = **sharp drop** | (not persistent) | live-match energy bar |
| **injury** | fitness status | minor = ability reduced, severe = cannot play | locks starting XI / injury record event | player card "injury" slot |
| **specialties** | specialty | bonus on specific events | player card "specialty" slot | player card "specialty" slot |
| **age** | number | (not directly used) | triggers 35+ decay system; long-term planning reference | player card "age" slot |

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Skills** (chapter 2) | headline skills + potential + form = PWI; the currentSkills vs potentialSkills gap |
| **Positions** (chapter 3) | high PWI ≠ good at every position, position weights differ |
| **Tier labels** (appendix 3) | experience uses the tier label for display, capped at L20 |
| **potentialTier** (this chapter) | **not the same system** as the tier label, don't mix them up |
| **Match events** (chapter 6) | form / experience / current energy bonuses apply to almost every match event |
| **Special events** (chapter 6) | injury record event + 14 other event types like `HAT_TRICK` |
| **Transfers** (chapter 18) | when buying, look at PWI + injury history + form + potentialTier + stamina (fatigue resistance) |

---

## Common mistakes (about attributes)

❌ **"High PWI = strong player"**: **a high PWI is just a high aggregate score** — if the headline skill doesn't match the position, the player disappears on the pitch
❌ **"Ignoring the potentialSkills gap"**: **high potential doesn't mean they can still grow** — read the gap between currentSkills and potentialSkills
❌ **"Chasing the perfect player"**: **LEGEND + maxed skills + healthy + young + cheap = doesn't exist**
❌ **"Ignoring form swings"**: **form < 1.5 = buy cheap** (post-injury recovery, may bounce back)
❌ **"Mixing up potentialTier and the tier label"**: **potential bracket ≠ skill/experience grade, two separate systems**
❌ **"Assuming age = decay"**: **age itself has no decay mechanic**, the decay system is a "35+" switch
❌ **"Judging a GK by pace / strength / set pieces"**: **irrelevant**, pace / strength / set pieces don't affect GK performance
❌ **"Playing through a minor injury like nothing"**: **ability is reduced**, don't gamble in key matches
❌ **"Only chasing GOLD specialties"**: **no specialty + high headline > GOLD specialty + low headline**
❌ **"Using a rookie like a veteran"**: **0 XP = neutral experience bonus (no boost)**, same skills but a veteran is more reliable on key events
❌ **"Ignoring low-stamina players"**: **low stamina = low fatigue resistance → late-match collapse**, be careful in key games

---

## Next

- [chapter 2: Player Skills](02-player-skills.md) — how skills grow / drop
- [chapter 3: Player Positions](03-positions.md) — 14 positions + headline skills
- [chapter 5: Lineup Basics](05-lineup-basics.md) — how to use these attributes when building a lineup
- [chapter 6: Match Basics](06-match-basics.md) — how these attributes play out in a match
- [chapter 18: Transfer Market](18-transfer.md) — which attributes to look at when buying
- [appendix 3: Player Tier Labels](A3-tier-labels.md) — the full tier label table
