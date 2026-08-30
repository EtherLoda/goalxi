---
order: 3
slug: positions
title: Player Positions
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 4, 5, 15]
relatedEntries: [position-keys-glossary, w-vs-wm, wbl-vs-lb, am-vs-cm, dm-vs-cdm, cfl-cfr-vs-cf, cd-cdl-cdr-vs-cb, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk]
---

# Player Positions

Every player on the pitch has a **position**. The position determines:
- **Where on the pitch** this player operates
- Which skills the engine **weights heavily** (headline vs almost no impact)
- The **bench / substitution / tactics** logic

GoalXI has **9 position families + 14 specific position keys**. Players in the same family can substitute for each other; different families generally can't (headlines differ).

> The full **position key dictionary** (all 14 specific keys: CD / CBL / CB / WBL / LM / WML / AM etc.) is in the FAQ `position-keys-glossary` entry. **Detailed position-vs-position comparisons** are in `w-vs-wm` / `wbl-vs-lb` / `am-vs-cm` / `dm-vs-cdm` / `cfl-cfr-vs-cf` entries.

---

## 9 position families at a glance

| Family | Position keys (zh / en) | Pitch area | Headline skills (qualitative) |
|---|---|---|---|
| **GK** | GK | in front of goal | reflexes / handling / positioning |
| **CB** (center back) | CB / CBL / CBR (3-slot) | in front of the box | defending / positioning / strength |
| **fullback** | LB / RB (traditional) / WBL / WBR (wing back) | flank | defending / positioning |
| **W** (winger) | LW / RW | furthest forward on flank | pace / dribbling / finishing |
| **WM** (wide midfielder) | LM / RM (actually WML / WMR) | flank midfield | pace / dribbling / passing / positioning |
| **CM** (central midfielder) | CM / CML / CMR (3-slot) | central midfield | passing / defending / dribbling |
| **DM** (defensive midfielder) | DM / DML / DMR (3-slot) | central midfield, deep | defending / positioning / strength |
| **AM** (attacking midfielder) | AM / AML / AMR (3-slot) | central midfield, forward | passing / dribbling / finishing |
| **CF** (center forward) | CF / CFL / CFR (3-slot) | in front of the box | finishing / positioning / strength |

> **3-slot** families (CB / CM / DM / AM / CF) can hold 1-3 players from the same family, all with the same skill weights.

---

## 3-slot vs 1-slot families

**3-slot families** (5): each has 3 slots with the same skill weights but different pitch positions:
- **CB**: CBL (left) / CB (center) / CBR (right) — 3 CBs in different positions
- **CM**: CML / CM / CMR
- **DM**: DML / DM / DMR
- **AM**: AML / AM / AMR
- **CF**: CFL / CF / CFR

**1-slot families** (4): single specific position per slot:
- **GK**: only GK
- **W**: LW / RW (2 slots, but not 1 family — 2 independent slots)
- **WM**: LM / RM (2 slots, actually WML / WMR)
- **fullback**: LB / RB (traditional) + WBL / WBR (wing back) — 4 slots, **not 1 family**

**Filling rules**:
- 3-slot families can hold 1-3 (a 4-back often only has 2 CBs)
- 1-slot families / wingers / wide midfielders: each slot is independent (0 / 1)

---

## Position-by-position details

### GK — Goalkeeper

- **Duty**: save goals. Saves, 1v1s, low balls, high balls
- **Headline**: `reflexes` / `handling` / `positioning`
- **Important**: `aerial` / `composure`
- **Almost no impact**: `pace` / `strength` / setPieces (don't enter GK save rating)
- **Common use**: **every team has exactly 1**; 4-3-3 / 4-4-2 / 3-5-2 all use 1 GK
- **GK shopping rule**: **only buy high `reflexes` / `handling`**; everything else is a bonus

### CB — Center Back (CBL / CB / CBR)

- **Duty**: defend in front of the box. Mark the opposing CF, block, head clear, build out
- **Headline**: `defending` / `positioning` / `strength`
- **Important**: `passing` (modern CBs must play out from the back)
- **Almost no impact**: `dribbling` / `finishing` / setPieces
- **3-slot**: left / center / right, can fill 1-3
- **Common use**:
  - 4-back = 2 CBs (traditional pair)
  - 3-back = 3 CBs (all filled)
  - 5-back = 3 CBs

### fullback — Side Back (LB / RB / WBL / WBR)

- **Duty**: defend the flank + limited overlap. Mark opposing winger, cover, cross
- **Headline**: `defending` / `positioning`
- **Important**: `pace` (recovery) / `strength` (duels)
- **Almost no impact**: `finishing` / setPieces
- **Two flavors**:
  - **Traditional fullback LB / RB** — sits deep, limited overlap → 4-back shapes
  - **Wing back WBL / WBR** — bombs forward, basically "half a W" → 3-CB / 352 / 3412 shapes
- **WBL shopping rule**: needs W-level body (`pace` + `dribbling` + `finishing` all there), otherwise can't recover
- **WBL leaves big space**: needs a CB covering, **or the CB must be good on the ball**

### W — Winger (LW / RW)

- **Duty**: furthest forward on the flank. Beat the fullback, cross, cut inside
- **Headline**: `pace` / `dribbling` / `finishing`
- **Important**: `passing` (cross quality)
- **Almost no impact**: `defending` / `positioning` / `composure` (W barely defends)
- **2 independent slots**: LW / RW each occupies a side
- **Common use**:
  - 4-3-3 / 4-2-3-1 / 3-4-3: 2 Ws
  - Counter-attack builds especially need W's pace (match-winners)

### WM — Wide Midfielder (LM / RM)

- **Duty**: flank midfield. Circulation, support defense, supply the winger
- **Headline**: `pace` / `dribbling` / `passing` / `positioning` (4 skills all matter)
- **Almost no impact**: `finishing`
- **2 independent slots**: LM / RM each occupies a side
- **vs W**: **WM tracks back, W doesn't**. WM is "half-and-half"
- **Common use**:
  - 4-4-2 midfield line: 2 WMs
  - 4-1-4-1 (defensive): use WMs
  - Possession-based: use WMs for wide circulation

### CM — Central Midfielder (CML / CM / CMR)

- **Duty**: central balance. Distribution + cover + progression
- **Headline**: `passing` / `defending` / `dribbling` (3 skills balanced)
- **Important**: `positioning` / `composure`
- **Almost no impact**: `finishing` (occasional late runs, not headline)
- **3-slot**: left / center / right
- **vs DM / AM**: CM balances both ends, DM is defense-leaning, AM is attack-leaning
- **Common use**:
  - 4-3-3 midfield line = 3 CMs (often 2 CMs + 1 DM config)
  - 4-2-3-1 double pivot = 2 CMs (defense-leaning)

### DM — Defensive Midfielder (DML / DM / DMR)

- **Duty**: first line in front of the CBs. Intercept, tackle, screen the back line
- **Headline**: `defending` / `positioning` / `strength`
- **Important**: `passing` (build-out)
- **Almost no impact**: `finishing` / `dribbling` (DM barely attacks)
- **3-slot**: left / center / right
- **"Single pivot" special case**: only 1 DM in the team → **highest demand on the DM** (passing + defending + positioning all need to be strong)
- **Common use**:
  - 4-2-3-1 double pivot: 2 DMs
  - 4-1-4-1: 1 DM + 4 CMs
  - **AM in front needs a DM behind**: AM barely defends, DM cleans up

### AM — Attacking Midfielder (AML / AM / AMR)

- **Duty**: furthest forward in midfield. Through balls, final pass, chance creation, late runs
- **Headline**: `passing` / `dribbling` / `finishing`
- **Almost no impact**: `defending` / `strength` (AM barely defends)
- **3-slot**: left / center / right
- **"Single AM" special case**: **must have a DM behind**, AM defense ≈ 0
- **Common use**:
  - 4-2-3-1 single AM: AM + 2 DMs
  - 4-1-2-1-2 diamond: 1 DM + 2 CMs + 1 AM
  - 3-4-1-2: 1 DM + 1 AM + 2 CMs

### CF — Center Forward (CFL / CF / CFR)

- **Duty**: in front of the box. Score, tap-in, hold-up, battering ram
- **Headline**: `finishing` / `positioning` / `strength`
- **Important**: `composure` (1v1 finishing)
- **Almost no impact**: `defending` / `passing` (CF distribution is weak; let the AM create)
- **3-slot**: left / center / right
- **CFL / CFR is for 3-striker shapes (3-4-3)**, not for single-striker
- **Common use**:
  - 4-3-3 / 4-4-2 strike pair = 1 CF (single arrow)
  - 4-4-2 strike pair = 2 CFs (no L/R split)
  - 3-4-3 = CFL + CF + CFR trio
  - CF shopping rule: **finishing is the bar**, everything else is bonus

---

## Headline-skill quick reference

> This is a **qualitative** reference. Per-position skill priority details are in the FAQ `skill-priority-*` entries.

| Position | Headline 2-3 | Important (secondary) | Almost no impact 2-3 |
|---|---|---|---|
| **GK** | reflexes / handling / positioning | aerial / composure | pace / strength / setPieces |
| **CB** | defending / positioning / strength | passing | dribbling / finishing / setPieces |
| **fullback** | defending / positioning | pace / strength | finishing / setPieces |
| **W** | pace / dribbling / finishing | passing | defending / positioning / composure |
| **WM** | pace / dribbling / passing | positioning / composure | finishing / strength |
| **CM** | passing / defending / dribbling | positioning / composure | finishing / strength |
| **DM** | defending / positioning / strength | passing | finishing / dribbling / setPieces |
| **AM** | passing / dribbling / finishing | pace | defending / strength |
| **CF** | finishing / positioning / strength | composure / pace | defending / passing / setPieces |

> **How to read**: `W` row = `pace / dribbling / finishing` are headlines (a W with these 3 high = strong W); `defending / positioning / composure` are almost no impact (W defending = 0).

---

## Cross-position comparisons (quick)

The pairs that get confused the most in GoalXI:

| Comparison | Key difference |
|---|---|
| **W vs WM** | W is pure attack (no defending); WM is half-and-half (must track back) |
| **WBL vs LB** | WBL bombs forward (half a W); LB sits deep (traditional) |
| **AM vs CM** | AM barely defends; CM balances; AM = "half a W" attack-leaning |
| **DM vs CM** | DM is defense-only, CM is balanced; DM attack ≈ 0 |
| **CFL/CFR vs CF** | CFL/CFR is for 3-striker (3-4-3), not single arrow |

Detailed comparisons in the FAQ: `w-vs-wm` / `wbl-vs-lb` / `am-vs-cm` / `dm-vs-cdm` / `cfl-cfr-vs-cf`.

---

## Common mistakes (position)

❌ **Cross-position PWI / skill comparison**: `W`'s PWI 18 ≠ `CB`'s PWI 18 — position weights differ, on-pitch impact differs wildly
❌ **Right player, wrong position**: an "all-round balanced" player in the wrong slot has no headline to use — invisible on the pitch
❌ **AM without a DM**: single-AM shapes **must have a DM behind**; AM defense ≈ 0, gets torn apart
❌ **WBL as LB**: WBL is a wing back, used in 3-CB shapes; LB is traditional, used in 4-back. Swapping = WBL goes up and never comes back = disaster
❌ **GK's pace / strength matter**: **they don't**; the GK save rating doesn't use them. A pace-18 GK and a pace-10 GK are identical
❌ **CF as the build-up hub**: CF's `passing` is almost no impact; CF distribution is weak. Let the AM do the creating
❌ **3-slot family with only 1 player**: **allowed** (common in 4-back shapes), but be aware that side has no rotation

---

## Relationship to other concepts

| Concept | Relation |
|---|---|
| **Skills** (Ch 2) | headline skills are the position's "fitness test" — high in headlines = good fit |
| **PWI** (Ch 4) | headline skills + potential + form combined; high PWI ≠ fit for any position |
| **BenchConfig / subs** (Ch 5) | lineup + bench — position + slots |
| **Tactics** (Ch 15) | tempo / pitchWidth / defensiveLine affect on-pitch performance at each position |
| **Formations** | position + count = formation (4-3-3 / 4-4-2 / 3-5-2 etc.) |

---

## What to read next

- [Ch 2: Player Skills](02-player-skills.md) — what each skill means
- [Ch 4: Player Other Attributes](04-player-attributes.md) — PWI / form / EXP / injury
- [Ch 5: Lineup Basics](05-lineup-basics.md) — how to place players in the right positions + bench
- [Ch 15: Match Tactics](15-tactics.md) — tactics that deploy positions
- [Appendix 3: Player Tier Labels](A3-tier-labels.md) — the 21-tier labels on the radar
