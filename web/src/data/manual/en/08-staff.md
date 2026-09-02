---
order: 8
slug: staff
title: Coaches
status: full
lastUpdated: 2026-08-30
relatedChapters: [7, 9]
relatedEntries: [comparing-two-players]
---

# Coaches

Coaches (also called staff) train your players, recover their stamina, and speed up injury recovery. This chapter covers **how to hire, how to upgrade (by replacing), how to fire, and what it costs**.

> The training mechanics themselves (assignments, how skills grow) are in [chapter 7](07-training.md). Injury mechanics are in [chapter 4](04-player-attributes.md). Coach wages vs your budget are in [chapter 9: Finance](09-finance.md).

---

## 5 levels (coach strength)

Every coach has one of **5 levels**:**Lv.1 → Lv.5**.

| Level | Role | Training bonus | Weekly wage (ref) |
|---|---|---|---|
| **Lv.1** | entry | lowest | 500 |
| **Lv.2** | junior | low | 2,000 |
| **Lv.3** | mid | medium | 8,000 |
| **Lv.4** | senior | high | 32,000 |
| **Lv.5** | top | highest | 128,000 |

**Key facts**:
- Higher level = **bigger training bonus** (the actual bonus is in [chapter 7](07-training.md))
- Higher level = **more expensive weekly wage** (each tier is roughly 4× the previous one)
- **No "in-place upgrade"** — to change a level, **fire + rehire**

---

## 7 coach roles

| Role | Function | Quantity limit |
|---|---|---|
| **Head coach** | baseline training bonus for the whole team | 1 |
| **Fitness coach** | stamina recovery bonus | 1 |
| **Technical coach** | trains 4 skills: finishing / passing / dribbling / defending | max 2 specialised (total) |
| **Psychology coach** | trains 2 skills: positioning / composure | ↑ |
| **Set piece coach** | trains 2 skills: free kicks / penalties | ↑ |
| **Goalkeeper coach** | trains 3 GK skills: reflexes / handling / aerial | ↑ |
| **Team doctor** | speeds up injury recovery | 1 |

**Core rules**:
- **One role, one coach** (head / fitness / doctor)
- **Total specialised coaches (technical / psychology / set piece / GK) ≤ 2** — you can have at most 2 specialised coaches at once
- Already 2 specialised? Can't hire a 3rd — fire one first
- Doctor is independent — **does not count toward the specialised limit**

---

## Hiring

Training page → "Hire specialised coach" / "Hire fitness coach".

**Steps**:
1. Pick a role
2. Pick a level (Lv.1 - Lv.5)
3. (Specialised coach) Pick a main trained skill
4. See the **signing fee + weekly wage** preview
5. Confirm → cash deducted → coach active

**Rules**:
- The role already has an active coach → **can't hire** (fire the old one first)
- Specialised total already at 2 → can't hire a 3rd
- **Insufficient cash** → system rejects ("Insufficient funds")
- After hire, **signing fee deducted immediately** (one-time) + **weekly wage starts ticking**

---

## Firing

**How to fire**: Training page → coach card → "Fire" → confirm.

**Effect**:
- Coach becomes **inactive** immediately (`isActive = false`)
- All players assigned to this coach go back to the **unassigned pool**
- **No more weekly wage**
- A **termination fee** may apply (weeks-of-wage compensation)

> Want to upgrade after firing? **Hire a new one** (pays the new signing fee). "Upgrading a coach" is just this flow in the system.

---

## "Upgrading" a coach = fire + rehire

**There's no in-place upgrade** mechanism. So-called "upgrading" in the system is:
1. Fire the existing coach (may pay termination fee)
2. Rehire at a higher level (pays new signing fee)
3. Old player assignments are **lost — re-drag** everyone

> Short-term "save money" tip: **don't swap every season**. An Lv.3 mid-tier coach can hold up for 2-3 seasons. Only go Lv.4 / Lv.5 when you're pushing for the title.

---

## How to use a specialised coach (assigning players)

Each specialised coach can take **up to 3 players**. The detailed mechanics are in [chapter 7](07-training.md); here are the **coach-side** facts:

- A coach can pick **1 "main trained skill"** (from the technical / mental / set piece / GK skill set)
- On the weekly tick, the coach trains their assigned players: main skill first → if at potential, switch to random
- **The higher the coach's level, the more weekly training points** each assigned player gets

---

## Team doctor (managed separately)

**The doctor isn't in the Training page** — they're managed in the Medical Room.

**Function**: **speed up injury recovery**. Higher level = faster recovery.

| Doctor level | Recovery bonus |
|---|---|
| Lv.1 | 1.1× |
| Lv.2 | 1.2× |
| Lv.3 | 1.3× |
| Lv.4 | 1.4× |
| Lv.5 | 1.5× |

> No doctor? You can still play, but injuries recover at the **base rate** (1.0×, slower).

---

## Contracts and renewals

Every coach has a **contract**:
- **Expiry date** (default 16 weeks)
- **Auto-renew** (default true)
- Renewal **costs nothing** — just extends the contract by 16 weeks
- **Turn off auto-renew** → at the expiry date the coach **auto-deactivates** (no new contract)

**At season end**:
- Auto-renew on → renew 16 weeks, stays active
- Auto-renew off → deactivates; you have no coach next season

**Manual early termination**: just **fire** (immediate deactivation + may pay termination fee)

---

## How to operate (overview)

1. **View current coaches** → Training page, coach cards (level, role, assigned players)
2. **Fire old ones** (if replacing)
3. **Hire new ones** → pick role → pick level → pick main skill → confirm payment
4. **Assign players to specialised coaches** (drag, max 3 per coach)
5. **Set the main trained skill** per coach (specialised coaches' "trained skill" dropdown)
6. **Manage the doctor separately** → Medical Room → hire / renew / fire
7. **Wait for the Thursday tick**

---

## 5-tier price reference

| Level | Weekly wage | Signing fee (16 weeks' wage) |
|---|---|---|
| Lv.1 | 500 | 8,000 |
| Lv.2 | 2,000 | 32,000 |
| Lv.3 | 8,000 | 128,000 |
| Lv.4 | 32,000 | 512,000 |
| Lv.5 | 128,000 | 2,048,000 |

**Practical guidance**:
- **Early game** (just took over the team): **don't hire anyone**, save up for a few weeks
- **First core squad forming**: **Lv.1 head + Lv.1 fitness** (1k / week combined) is enough
- **Mid-table**: **Lv.2-3 specialised** (10-20k / week total) + Lv.1 head
- **Pushing for the title**: **Lv.4-5** (a single Lv.5 = 130k / week; signing fee 2M+). **Don't sign without checking the budget first** (see [chapter 9: Finance](09-finance.md))

> Wages auto-deduct weekly. **Check [chapter 9: Finance](09-finance.md) before signing.**

---

## Common mistakes

❌ **"I already have a coach and want to upgrade"** — no in-place upgrade; **fire then rehire**
❌ **"I want a 3rd specialised coach"** — **max 2 specialised**; fire one first
❌ **"I hired but don't see the coach"** — payment may have failed; refresh the Training page
❌ **"I fired but didn't get a refund"** — **signing fee is non-refundable**; you only stop paying the weekly wage
❌ **"Contract expired and the coach is gone"** — auto-renew was off; **turn it on at season end**
❌ **"My doctor is gone"** — same as above
❌ **"I changed the main trained skill but the player still trains elsewhere"** — probably the main skill **hit potential** and the system fell back to random (see [chapter 7](07-training.md))
❌ **"Lv.5 doctor is too expensive"** — depends on injury pressure. Lots of injuries → buy; few → Lv.1-2 is enough

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Training** (chapter 7) | coaches are the core of training; higher level = bigger bonus |
| **Injuries** (chapter 4) | the doctor speeds up recovery; doesn't directly affect on-pitch performance |
| **Finance** (chapter 9) | signing fee + weekly wages are expenses; check the budget first |
| **Lineup** (chapter 5) | coaches only train; **they don't set the lineup** |

---

## Next

- [chapter 7: Training](07-training.md) — how to use coaches, stamina intensity, how skills grow
- [chapter 4: Player Other Attributes](04-player-attributes.md) — how form / experience / injury affect on-pitch play
- [chapter 9: Finance](09-finance.md) — coach wages + signing fees vs your budget
