---
order: 7
slug: training
title: Training
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 4, 8, 9]
relatedEntries: [condition-form-injury, comparing-two-players, pwi-vs-overall, outfield-skills-meaning, gk-skills-vs-outfield]
---

# Training

Between matches, your team is in **training**. Training's purpose is to:
- Recover stamina (every match drains it)
- Grow skills (long-term development)
- Earn experience (see [chapter 4](04-player-attributes.md))

This chapter covers **how to set training**, **how to hire coaches**, **how to assign players**, and **when skills grow**.

> The training UI lives in the Training page. Stamina / experience / PWI basics are in [chapter 4](04-player-attributes.md).

---

## Training schedule

- **Weekly training tick**: **Thursday** (player data updates)
- **Stamina intensity**: **adjustable once per week**
- **Coach assignments**: editable any time (changes take effect at the next tick)

> On Monday the **35+ decay system** also runs in the background (see [chapter 4](04-player-attributes.md)). **That's decay, not training** — the two are separate.

---

## Stamina training intensity (one per team)

**Stamina intensity** is a team-wide 0-1 slider, **default 0.1**.

**Effect**: it **trades stamina recovery vs specialised training points** —
- **Higher** = **more stamina recovery** (players get tired less in matches)
- **Lower** = **more specialised training points** (skills grow faster, but players get tired faster)
- **Balanced** = stay near the default — most teams do this

**How to adjust**:
- Open the Training page, find the stamina slider
- Drag to your target value
- **Save** — once per week only
- Changes apply at the next Thursday tick

> **Don't churn it** — frequent changes disrupt the rhythm. A common pattern: **higher at season start** (rest) → **mid in mid-season** (balance) → **higher again at season end** (rest up for next season).

---

## 7 staff roles (coach positions)

| Role | Function |
|---|---|
| **Head coach** | baseline training bonus for the whole team (each level adds more) |
| **Fitness coach** | stamina recovery bonus |
| **Technical coach** | trains 4 skills: finishing / passing / dribbling / defending |
| **Psychology coach** | trains 2 skills: positioning / composure |
| **Set piece coach** | trains 2 skills: free kicks / penalties |
| **Goalkeeper coach** | trains 3 GK skills: reflexes / handling / aerial |
| **Team doctor** | injury-related (not covered in this chapter) |

> Set pieces and free kicks / penalties **train especially fast**. Mental skills (positioning / composure) also train fast. Physical skills (pace / strength) train slower.

**How many players per coach**:
- **Head coach** and **fitness coach**: the whole team
- **Specialised coach** (technical / psychology / set piece / GK): **max 3 players each**
- **Total specialised coaches per team**: **2 max** (excludes head coach and team doctor)

**Coaches themselves**:
- Have a **level** (1-10); higher level = bigger training bonus
- Have a **signing fee** and **weekly salary** (financial pressure, see [chapter 9: Finance](09-finance.md))
- Can be **upgraded** to a higher level
- Can be **fired** (their assigned players go back to "unassigned")

---

## How to assign players (drag)

Each specialised coach can take **up to 3 players**. Assignment flow:

1. Training page → pick a specialised coach card
2. **Drag a player** onto the coach (from the "unassigned players" area)
3. The coach card shows the count (e.g. 2/3)
4. **Save** the assignment

**Rules**:
- **One player can be assigned to multiple specialised coaches** (each coach gives that player their own weekly points)
- **Goalkeepers can only go to a GK coach**
- Coach full at 3 → no more additions
- Training page shows "coaches full" → can't hire a 3rd specialised coach

---

## Coach's "main trained skill"

Each specialised coach can pick **1 "main trained skill"**:
- Technical coach: one of 4 (finishing / passing / dribbling / defending)
- Psychology coach: positioning / composure
- Set piece coach: free kicks / penalties
- GK coach: reflexes / handling / aerial

**How it works**:
- When the coach trains the player, **the main skill is prioritised**
- If the player **hasn't hit potential** on that skill → train it
- If that skill **has hit potential** → pick another random skill not yet at potential
- **Skip the choice** → pick a random skill not yet at potential each week

> How to change: Training page → coach card → "trained skill" dropdown.

---

## How skills grow

At the Thursday tick, an assigned player gets **specialised training points**, spent by the following rules:

1. **Spend on the "main trained skill" first** (if not at potential)
2. Otherwise **pick a random skill not yet at potential**
3. Points convert to a **skill increase** by **current skill level**:
   - **Low-level skills** grow fast (cheap)
   - **High-level skills** grow slow (expensive; the higher, the more expensive)
4. **Stops at the potential cap** (won't exceed the value in potentialSkills)

**Practical meaning**:
- Training a low-potential player AND a high-potential player → low-potential maxes out fast (wasted), high-potential is slow but high-yield
- **Don't train one skill only** — growth is spread; maxed skills are parked
- **Pick the main skill well** — 16 weeks per season, what you train is mostly fixed

> How much growth also depends on **age**, **coach level**, and the **skill's training speed** (below).

---

## Age effect (training efficiency)

**Training efficiency scales linearly with age**:
- **17 years old**: full efficiency
- **17-36 years old**: linear decline
- **36+ years old**: lowest efficiency

**Practical meaning**:
- **Young players train fast**, gains are obvious
- **Veterans train slow** — same coach / same skill, smaller gains
- 36+: even with a good coach, big jumps are rare
- Distinct from the 35+ decay (see [chapter 4](04-player-attributes.md)) — that's "skills drop", this is "skills grow slowly"

---

## Training history (audit log)

At the bottom of the Training page, there's a **weekly training update** list:
- Which season / which week
- Per player: **skill before / skill after / what grew**
- Filter by season + week to find a specific historical week

**How to use it**:
- See if your core players are growing on schedule
- Investigate "why did this player not move this week" — possibly unassigned, maxed, or too old
- Plan the next week's assignment changes

---

## Full operation flow (summary)

1. **Set stamina intensity** → Save (once per week)
2. **Hire coaches** (if you don't have any, or want to upgrade)
3. **Upgrade coaches** (level up for bigger bonuses)
4. **Assign players** to coaches (drag-and-drop, max 3 per coach)
5. **Set the coach's "main trained skill"** (optional)
6. **Wait for the Thursday tick**
7. **Read the training history** to confirm the growth

---

## Common mistakes

❌ **Stamina intensity too high / too low** — higher = less tired but slower skill growth, lower = opposite. Extreme values break the balance; near default is safest
❌ **Changing stamina intensity more than once a week** — the system only allows one change; wait for next Thursday
❌ **Hiring 3 specialised coaches** — **max 2**, and team doctor / head coach don't count toward that
❌ **One coach with 4 players** — max 3
❌ **"I hired a technical coach but the player didn't grow"** — the player may have **hit potential on that skill** — pick a different skill, or a different player
❌ **"I changed the main trained skill but the player still trains elsewhere"** — the main skill **is at potential**; the system falls back to random
❌ **"My 36-year-old veteran won't grow"** — **age lowers efficiency**, normal, not a bug
❌ **"A veteran's skill dropped"** — that's the **35+ decay system** (see [chapter 4](04-player-attributes.md)), not training
❌ **Players disappear after firing a coach** — they don't; they go back to "unassigned", just no one is coaching them
❌ **Forgot to set the "main trained skill"** — that's OK; the system trains a random skill not yet at potential, but specifying is more efficient

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Skills** (chapter 2) | training grows skills; **stops at potential** |
| **Positions** (chapter 3) | when growing, prefer headline skills for the position |
| **Other attributes** (chapter 4) | training also grants experience; affects form |
| **Coaches** (chapter 8) | higher coach level = bigger training bonus |
| **Finance** (chapter 9) | coaches have **wages**; higher level = more expensive |
| **35+ decay** | separate from training — one grows, one drops; two systems |

---

## Next

- [chapter 2: Player Skills](02-player-skills.md) — the 10 + 9 skills and potential
- [chapter 4: Player Other Attributes](04-player-attributes.md) — stamina / form / experience / 35+ decay
- [chapter 5: Lineup Basics](05-lineup-basics.md) — once your players are trained, set the lineup
- [chapter 8: Coaches](08-staff.md) — how to hire, upgrade, fire coaches
- [chapter 9: Finance](09-finance.md) — coach wages and your budget
