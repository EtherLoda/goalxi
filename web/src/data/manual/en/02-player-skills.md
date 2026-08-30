---
order: 2
slug: player-skills
title: Player Skills
status: full
lastUpdated: 2026-08-30
relatedChapters: [3, 4, 14, 15]
relatedEntries: [outfield-skills-meaning, gk-skills-vs-outfield, skill-dimensions-note, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# Player Skills

Every player's "on-pitch ability" is defined by a set of 0-20 skill values.

- **Outfield players** have 10 skills (4 dimensions)
- **GK players** have 9 skills (8 overlap with outfield, 3 are GK-specific)

Each skill ranges **0-20**, default **10**. Higher value = better performance in the relevant situations. The radar shows each skill as a **numeric value + 21-tier label** (the label table is in [Appendix 3: Player Tier Labels](A3-tier-labels.md)).

> This chapter is about **what each skill is**. **Which skills each position values** is in [Ch 3: Player Positions](03-positions.md). **How to read the 21-tier labels** is in [Appendix 3](A3-tier-labels.md).

## Value range + double line

- **Range**: 0-20 per skill, default 10 (10 = "average")
- **Radar double line**:
  - **Solid** = `currentSkills` (current ability, what you actually have)
  - **Dashed** = `potentialSkills` (upper bound, the skill won't grow past this)

The gap between solid and dashed = how much more the player can grow. Senior players have nearly-merged lines; youth players have a big gap (still developing).

---

## Outfield: 10 skills

4 dimensions: **physical (2) + technical (4) + mental (2) + setPieces (2)** = 10.

### physical

| Skill | On-pitch behavior |
|---|---|
| **pace** | sprint, run in behind, recovery runs |
| **strength** | physical duels, headers, holding off opponents |

### technical

| Skill | On-pitch behavior |
|---|---|
| **finishing** | goalscoring, shots in the box |
| **passing** | through balls, long balls, crosses, switches |
| **dribbling** | 1v1 beat, going wide / cutting inside |
| **defending** | tackles, interceptions, blocks |

### mental

| Skill | On-pitch behavior |
|---|---|
| **positioning** | off-ball movement, defensive shape, runs into the box |
| **composure** | calm under pressure, no panic errors, key-pass composure |

### setPieces

| Skill | On-pitch behavior |
|---|---|
| **freeKicks** | direct free-kick taker quality |
| **penalties** | penalty taker quality |

> Set-pieces are position-independent — the deciding factor is "who takes them", not where the player is on the pitch.

---

## GK: 9 skills

4 dimensions (8 shared with outfield, 3 GK-specific):

### physical

| Skill | On-pitch behavior | GK importance |
|---|---|---|
| **pace** | (no meaningful on-pitch impact) | barely affects GK rating |
| **strength** | (no meaningful on-pitch impact) | barely affects GK rating |

### technical — GK-specific (replaces outfield's 4)

| Skill | On-pitch behavior | GK importance |
|---|---|---|
| **reflexes** | save reaction, close-range shots saved or not | **critical** (headline) |
| **handling** | catching cleanly, high balls claimed not parried | **critical** (headline) |
| **aerial** | high-ball claiming (rushing out or in net) | important |

### mental

| Skill | On-pitch behavior | GK importance |
|---|---|---|
| **positioning** | shape, narrowing angles, being in the right place | important |
| **composure** | calm, no fumbles, calm under key-save pressure | secondary |

### setPieces

| Skill | GK importance |
|---|---|
| **freeKicks** | position-independent |
| **penalties** | position-independent |

> A GK's `pace` and `strength` show up on the radar but **do not enter the GK save rating**. A GK with pace 18 and a GK with pace 10 perform identically. When shopping for a GK, **look at reflexes / handling / aerial / positioning / composure only** — that's the 5-skill set that matters.

---

## How skills grow / shrink

| Source | Effect | Details |
|---|---|---|
| **Matches** | post-match engine awards +1 to skills in scope (up to potential) | [Ch 6: Match Basics](06-match-basics.md) |
| **Training** | Thursday per the category you set (1 of 5) | [Ch 7: Training](07-training.md) |
| **Decline** | seniors (35+) lose 1 occasionally, ticked on Monday | [Ch 4: Player Other Attributes](04-player-attributes.md) |
| **Youth reveal** | youth players reveal 1 skill per week (fog mechanic) | [Ch 19: Youth](19-youth.md) |
| **Transfers** | bought players' currentSkills are fixed (the seller chose) | [Ch 18: Transfer Market](18-transfer.md) |

**Ceiling**: skills stop growing when they reach `potentialSkills` (the dashed line). Senior players' potential is fixed; youth players' currentSkills hit the ceiling and stop.

**Natural decay is rare**:
- **35+ year-old veterans** may lose skill via the decline system (Monday background tick)
- **Severe injury** during a match may underperform, but the skill value itself doesn't directly drop
- Training **never decreases** skills

---

## Relationship to other concepts

| Concept | Relation |
|---|---|
| **position** (Ch 3) | determines which skills the engine weights heavily → see [Ch 3: Player Positions](03-positions.md) |
| **21-tier label** (Appendix 3) | every 0-20 skill value renders a tier label on the radar → see [A3-tier-labels](A3-tier-labels.md) |
| **PWI / overall** (Ch 4) | headline skills + potential + form combined into a composite score, not a simple sum |
| **form** (Ch 4) | short-term state, orthogonal to skills (high form doesn't mean high skills) |
| **experience / level** (Ch 4) | long-term "seasoning", orthogonal to skills (veteran doesn't mean skilled) |
| **potentialSkills** (Ch 4) | the ceiling, skills stop growing at it |
| **specialties** (Ch 4) | event-trigger bonus labels, unrelated to specific skill values |

---

## Common mistakes (about the skills themselves)

❌ **"Balanced radar = strong"**: balanced only means even distribution, **not** high PWI; real strength is PWI
❌ **Chasing all-high skills**: there's a ceiling + wage constraint; real players have strengths and weaknesses, **strengths in the right position are enough**
❌ **Treating a GK's pace / strength radar as meaningful**: **useless**, the GK save rating doesn't use them
❌ **Ignoring the 4-dimension grouping**: the 21-tier label doesn't group by dimension (L0-L20 applies to all), but **the actual skill types are different** — pace 20 stamina ≠ reflexes 20 save reaction

> Mistakes about **cross-position skill comparison** or **picking the wrong position for a player** live in [Ch 3: Player Positions](03-positions.md).

---

## What to read next

- [Ch 3: Player Positions](03-positions.md) — 14 positions + headline skills per position (qualitative, no specific values)
- [Ch 4: Player Other Attributes](04-player-attributes.md) — PWI / form / EXP / injury / specialty
- [Ch 5: Lineup Basics](05-lineup-basics.md) — how to place players in the right positions
- [Appendix 3: Player Tier Labels](A3-tier-labels.md) — full 21-tier label table
