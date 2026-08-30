---
order: 2
slug: player-skills
title: Player Skills
status: full
lastUpdated: 2026-08-30
relatedChapters: [3, 4, 14, 17]
relatedEntries: [outfield-skills-meaning, gk-skills-vs-outfield, skill-dimensions-note, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# Player Skills

Every player's "on-pitch ability" is defined by a set of 0-20 skill values.

- **Outfield players** have 10 skills (4 dimensions)
- **GK players** have 9 skills (8 overlap with outfield, 3 are GK-specific)

Each skill ranges **0-20**, default **10**. Higher value = better performance in the relevant situations. The radar chart shows each skill as a numeric value with a tier label.

> This chapter answers two questions: **what the 19 skills are** and **how to read the 21-tier labels** on the radar. Which skills each position values (headline vs almost no impact) is covered in [Ch 4: Lineup Basics](04-lineup-basics.md).

## Value range + double line

- **Range**: 0-20 per skill, default 10 (10 = "average", neither strong nor weak)
- **Radar chart double line**:
  - **Solid** = `currentSkills` (current ability, what you actually have)
  - **Dashed** = `potentialSkills` (upper bound, the skill won't grow past this)

The gap between solid and dashed = how much more the player can grow. Senior players have nearly-merged lines (already grown); youth players have a big gap (still developing).

---

## Outfield: 10 skills

4 dimensions: **physical (2) + technical (4) + mental (2) + setPieces (2)** = 10.

### physical

| Skill | On-pitch behavior | Which positions value it |
|---|---|---|
| **pace** | sprint, run in behind, recovery runs | winger headline / midfielder secondary / CB secondary |
| **strength** | physical duels, headers, holding off opponents | CB headline / CF secondary / DM secondary |

### technical

| Skill | On-pitch behavior | Which positions value it |
|---|---|---|
| **finishing** | goalscoring, shots in the box | CF headline / winger secondary / AM secondary |
| **passing** | through balls, long balls, crosses, switches | AM / CM headline / winger secondary |
| **dribbling** | 1v1 beat, going wide / cutting inside | winger headline / AM secondary |
| **defending** | tackles, interceptions, blocks | CB headline / DM secondary / fullback secondary |

### mental

| Skill | On-pitch behavior | Which positions value it |
|---|---|---|
| **positioning** | off-ball movement, defensive shape, runs into the box | CB secondary / DM secondary / CF secondary (tap-ins) |
| **composure** | calm under pressure, no panic errors, key-pass composure | CF secondary / AM secondary |

### setPieces

| Skill | On-pitch behavior | Which positions value it |
|---|---|---|
| **freeKicks** | direct free-kick taker quality | position-independent, depends on taker |
| **penalties** | penalty taker quality | position-independent, depends on taker |

---

## GK: 9 skills

4 dimensions (8 shared with outfield, 3 GK-specific):

### physical

| Skill | On-pitch behavior | Importance |
|---|---|---|
| **pace** | (no meaningful on-pitch impact) | barely affects GK rating |
| **strength** | (no meaningful on-pitch impact) | barely affects GK rating |

### technical — GK-specific (replaces outfield's 4)

| Skill | On-pitch behavior | Importance |
|---|---|---|
| **reflexes** | save reaction, close-range shots saved or not | **critical** (one of GK's headlines) |
| **handling** | catching cleanly, high balls claimed not parried | **critical** (one of GK's headlines) |
| **aerial** | high-ball claiming (rushing out or in net) | important |

### mental

| Skill | On-pitch behavior | Importance |
|---|---|---|
| **positioning** | shape, narrowing angles, being in the right place | important |
| **composure** | calm, no fumbles, calm under key-save pressure | secondary |

### setPieces

| Skill | On-pitch behavior | Importance |
|---|---|---|
| **freeKicks** | position-independent | position-independent |
| **penalties** | position-independent | position-independent |

> A GK's `pace` and `strength` will show up on the radar but **do not enter the GK save rating**. A GK with pace 18 and a GK with pace 10 perform identically in goal. When shopping for a GK, **look at reflexes / handling / aerial / positioning / composure only** — that's the 5-skill set that matters.

---

## 21-tier label

Every 0-20 skill value renders as a **tier label** (radar, skill panel, player card). This label set is the same one used for player **experience level** (L0-L20):

| Value | L | English | 中文 |
|---|---|---|---|
| 0 | L0 | None | 无 |
| 1 | L1 | Terrible | 糟糕 |
| 2 | L2 | Poor | 差劲 |
| 3 | L3 | Mediocre | 平庸 |
| 4 | L4 | Average | 一般 |
| 5 | L5 | Competent | 合格 |
| 6 | L6 | Satisfactory | 差强人意 |
| 7 | L7 | Good | 良好 |
| 8 | L8 | Excellent | 优秀 |
| 9 | L9 | Formidable | 强大 |
| 10 | L10 | Outstanding | 杰出 |
| 11 | L11 | Superb | 精湛 |
| 12 | L12 | Apex | 顶尖 |
| 13 | L13 | Superior | 卓越 |
| 14 | L14 | World-Class | 超一流 |
| 15 | L15 | Magnificent | 卓绝 |
| 16 | L16 | Exceptional | 出类拔萃 |
| 17 | L17 | Peerless | 举世无双 |
| 18 | L18 | Unmatched | 登峰造极 |
| 19 | L19 | Transcendent | 空前绝后 |
| 20 | L20 | Beyond Compare | 化境 |

**How to read**:
- A player with skill 18 = radar shows `L18 Unmatched`, value 18
- A player with skill 5 = `L5 Competent`, barely matters on the pitch
- Each of the 10/9 skills on a player has its **own** tier label (they don't combine into one overall)

---

## How skills grow / shrink

| Source | Effect | Details |
|---|---|---|
| **Matches** | post-match engine awards +1 to skills in scope (up to potential) | [Ch 5](05-match-basics.md) |
| **Training** | Thursday per the category you set (1 of 5) | [Ch 6](06-training.md) |
| **Decline** | seniors (35+) lose 1 occasionally, ticked on Monday | [Ch 3](03-player-attributes.md) |
| **Youth reveal** | youth players reveal 1 skill per week (fog mechanic) | [Ch 18](18-youth-and-scouts.md) |
| **Transfers** | bought players' currentSkills are fixed (the seller chose) | [Ch 17](17-transfer.md) |

**Ceiling**: skills stop growing when they reach `potentialSkills` (the dashed line). Senior players' potential is fixed; youth players' currentSkills hit the ceiling and stop.

**Natural decay is rare**:
- Current skills do **not** drop from not playing — only **decline (seniors)** + **severe injury** can cause a drop
- Training **does not** decrease skills (only increases)

---

## Position × skill: not interchangeable

The same skill has **wildly different value** depending on position. A player with a balanced radar can be invisible on the pitch in the wrong slot.

**Classic examples**:
- **Winger (W)**: `pace + dribbling` are headlines, `defending` is irrelevant
- **Center Back (CB)**: `defending` is the headline, `dribbling / finishing` are irrelevant
- **Center Forward (CF)**: `finishing + positioning` are headlines, `defending` is irrelevant
- **Defensive Midfielder (DM)**: `defending + positioning` are headlines, `finishing` is irrelevant
- **Central Midfielder (CM)**: `passing + defending` balanced, fewer pure-attack headlines
- **Attacking Midfielder (AM)**: `passing + dribbling` are headlines, `defending` is irrelevant
- **GK**: `reflexes + handling` are headlines, `pace / strength` are irrelevant

**How to find which skills each position values**: see [Ch 4: Lineup Basics](04-lineup-basics.md) and the FAQ entries `skill-priority-w` / `skill-priority-cb` / `skill-priority-cm-dm-am` / `skill-priority-cf` / `skill-priority-gk` (per-position headline tables).

---

## Relationship to other concepts

| Concept | Relation |
|---|---|
| **PWI / overall** (Ch 3) | headline skills + potential + form combined into a composite score, not a simple sum |
| **Position** (Ch 4) | determines which skills the engine weights heavily |
| **form** (Ch 3) | short-term state, orthogonal to skills (high form doesn't mean high skills) |
| **experience / level** (Ch 3) | long-term "seasoning", orthogonal to skills (veteran doesn't mean skilled) |
| **potentialSkills** (Ch 3) | the ceiling, skills stop growing at it |
| **specialties** (Ch 3) | event-trigger bonus labels, unrelated to specific skill values |

---

## Common mistakes

❌ **Cross-position skill comparison**: a W's defending 18 and a CB's defending 18 are **not equivalent** — position weights differ, the former is irrelevant, the latter is the headline
❌ **Assuming a "balanced" radar = strong player**: balanced radar only means even distribution, **not** high PWI; real strength is PWI
❌ **Chasing all-high skills**: there's a ceiling + wage constraint; real players have strengths and weaknesses, **strengths in the right position are enough**
❌ **Ignoring the 4-dimension grouping**: the 21-tier label doesn't group by dimension (L0-L20 applies to all), but **the actual skill types are different** — pace 20 stamina and reflexes 20 save reaction are **not the same kind of "strong"**
❌ **Trying to use pace / strength on a GK**: **useless**, the GK save rating doesn't use them; ignore these when shopping for a GK

---

## What to read next

- [Ch 3: Player Other Attributes](03-player-attributes.md) — PWI / form / EXP / injury / specialty
- [Ch 4: Lineup Basics](04-lineup-basics.md) — 14 position families, how to pick a player for each
- [Ch 5: Match Basics](05-match-basics.md) — how the match uses these skills
- [Ch 6: Training](06-training.md) — how skills grow
- [Ch 14: Match Tactics](14-tactics.md) — tactics that deploy these skills
