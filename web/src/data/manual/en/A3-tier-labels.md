---
order: 3
slug: tier-labels
title: Player Tier Labels
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 4]
relatedEntries: [experience-meaning]
---

# Player Tier Labels

GoalXI uses a **21-tier label set** to translate skill and experience values (0-20) into human-readable names. This label set is **shared across multiple surfaces** — every chapter that references it pulls the same table.

## Where this label set is used

- **Skills** — each skill on the radar (0-20) gets one label (skill panel, player card)
- **Experience** — accumulated XP maps to player level → one label (experience badge)
- **Position strength** (future) — some strength metrics may also use it

> In short: **the labels on the radar, the player card, and the experience badge all come from this table**.

---

## Full 21-tier table

| Value range | L | English | 中文 | Rough meaning |
|---|---|---|---|---|
| 0 | **L0** | None | 无 | no data / can't play |
| 1 | **L1** | Terrible | 糟糕 | amateur |
| 2 | **L2** | Poor | 差劲 | well below average |
| 3 | **L3** | Mediocre | 平庸 | below average |
| 4 | **L4** | Average | 一般 | league average |
| 5 | **L5** | Competent | 合格 | bench-worthy |
| 6 | **L6** | Satisfactory | 差强人意 | rotation |
| 7 | **L7** | Good | 良好 | mid-table starter |
| 8 | **L8** | Excellent | 优秀 | strong-team starter |
| 9 | **L9** | Formidable | 强大 | top-team starter |
| 10 | **L10** | Outstanding | 杰出 | near-national-team |
| 11 | **L11** | Superb | 精湛 | national-team level |
| 12 | **L12** | Apex | 顶尖 | league best |
| 13 | **L13** | Superior | 卓越 | league MVP contender |
| 14 | **L14** | World-Class | 超一流 | international |
| 15 | **L15** | Magnificent | 卓绝 | top European |
| 16 | **L16** | Exceptional | 出类拔萃 | elite European |
| 17 | **L17** | Peerless | 举世无双 | world-class |
| 18 | **L18** | Unmatched | 登峰造极 | generational |
| 19 | **L19** | Transcendent | 空前绝后 | historic |
| 20 | **L20** | Beyond Compare | 化境 | maxed ceiling |

> **The "rough meaning" is just a guideline** — actual strength is determined by **PWI** and the position fit, not the tier label. An L12 winger isn't necessarily stronger than an L10 CF.

---

## How to read

### Skills (0-20 → L0-L20 direct mapping)

Each skill on the radar shows its label next to the value:

- `pace 18` = `L18 Unmatched`
- `dribbling 12` = `L12 Apex`
- `defending 5` = `L5 Competent`

Each skill **maps independently** (no aggregation). **A W with pace 18 + dribbling 6 is weaker than a W with pace 6 + dribbling 18** — both are missing a headline.

### Experience (cumulative XP → L0-L20, **display caps at L20**)

Experience maps from cumulative XP, but the **display caps at L20** — the internal level keeps growing (no cap), but the label doesn't exceed `L20 Beyond Compare`.

So an L20 veteran can actually be at very different XP totals (just-reached L20 vs. L30+), but **all show the same label**. To tell veterans apart, hover for the raw XP.

**Hover** on the tier label to see the raw number (skill 18, XP 162, etc.).

---

## Cross-label comparisons

- A single player with **skill L12 + experience L20** is fine — these are **two independent dimensions** of label
- **Skill L20 doesn't mean "strong"** — must be the right position
- **Experience L20 doesn't mean "stable"** — must also have the right skills
- Two players both labeled L18 can mean very different things: one might be **pace 18 + everything else mediocre**, another might be **pace 18 + dribbling 18 + finishing 16** — L18 only says "this stat hit the bar"

---

## Relationship to other concepts

| Concept | Relation |
|---|---|
| **Skills** (Ch 2) | skill 0-20 → label, per skill |
| **PWI / overall** (Ch 4) | headline skills + potential + form combined, **not** the tier label |
| **Experience / level** (Ch 4) | cumulative XP → label, caps at L20 |
| **Position** (Ch 3) | headline skills + position = player's value to the team, **not** the tier label |
| **potentialTier** (Ch 4) | 5 bands (LOW / REGULAR / HIGH_PRO / ELITE / LEGEND), **a different system from the 21-tier label** — don't mix them up |

> `potentialTier` is a 5-band "potential ceiling" label. `tier label` is the 21-step "current skill/experience" label. They sound similar but **are different systems**.

---

## Common mistakes

❌ **Using the 21-tier label as PWI**: L18 Unmatched ≠ strong player; look at PWI
❌ **Mixing dimensions**: skill L12 + experience L20 is not a composite score, read them separately
❌ **"L20 = maxed"**: L20 is the display cap, the internal level keeps growing past it
❌ **"L0 = 0"**: L0 is the "no data" label, not a real "0 value" (a normal player starts at L1 Terrible)
❌ **Confusing with potentialTier**: 5 bands ≠ 21 tiers, two different systems
❌ **Only looking at the highest skill label**: each skill is independent; check all 10/9, not just the headline

---

## What to read next

- [Ch 2: Player Skills](02-player-skills.md) — what the skills are, how they grow
- [Ch 3: Player Positions](03-positions.md) — 14 positions + headline skills
- [Ch 4: Player Other Attributes](04-player-attributes.md) — PWI / form / EXP / injury / specialty / potentialTier
