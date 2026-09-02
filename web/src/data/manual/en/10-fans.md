---
order: 10
slug: fans
title: Fans
status: full
lastUpdated: 2026-08-30
relatedChapters: [6, 9, 11]
relatedEntries: []
---

# Fans

Fan count + fan emotion are the team's "popularity" indicators. **More fans = more sponsorship + more tickets**; **higher emotion = fuller home ground + match boost**. This chapter covers how the fan system affects your team.

> Sponsorship and ticket income are in [chapter 9: Finance](09-finance.md). Stadium capacity / building is in [chapter 11: Stadium](11-stadium.md). In-match attendance is in [chapter 6](06-match-basics.md).

---

## 3 core fields

Each team has one fan record with 3 fields:

| Field | Meaning | Default | Range |
|---|---|---|---|
| **Total fans** | number of supporters | 10,000 | 1,000 - hidden cap |
| **Fan emotion** | emotional temperature | 50 | 0-100 |
| **Recent 5 matches** | W / D / L string | empty | 5 chars |

- **Total fans** drives **sponsorship income** (base × 2 × √(fans / 10,000); more fans = more sponsorship)
- **Fan emotion** drives **ticket sales** (home attendance) and the **match-day atmosphere**

---

## Total fans (how it changes)

### Weekly settlement

The settlement scheduler runs a weekly tick using a bilinear model — based on `fans / cap` ratio + fan emotion:

- **Small club + high emotion** → big growth (up to +1,750/week)
- **Small club + low emotion** → small growth (+650/week; small clubs have "growth protection")
- **Top club + high emotion** → small growth (+200/week; basically saturated)
- **Top club + low emotion** → decline (up to −750/week; top clubs are emotion-sensitive)

**Floor 1,000**: even in the worst run, you keep 1,000 fans.

### Hidden cap (per league tier)

| League | Cap |
|---|---|
| L1 | 300,000 |
| L2 | 200,000 |
| L3 | 150,000 |
| L4 | 110,000 |
| L5+ | 100,000 |

Growth near the cap is **near zero**. To break through, get promoted.

### Promotion / relegation (one-time)

| Event | Fans | Emotion |
|---|---|---|
| **Promoted** | +10% (floored) | +20 (capped at 100) |
| **Relegated** | -10% | -20 (floored at 0) |

> One promotion = free +10% fans + 20 emotion. A relegation-threatened side takes a double hit on both metrics.

---

## Fan emotion (how it changes)

### Per match (automatic)

Algorithm: **actual points − expected points** (ELO system) = delta, then mapped to emotion change by result:

| Result | Emotion change | Notes |
|---|---|---|
| **Win** | +2 to +14 | base +2, +4 per +delta point (bigger upsets = bigger boost) |
| **Draw** | −8 to +8 | pure linear, no floor |
| **Loss** | −12 to 0 | −4 per −delta point (bigger upsets = bigger drop) |

> Strong team vs weak (expected ≈ 3, got 3): delta 0 → emotion +2 (base reward)
> Weak team vs strong (expected ≈ 0, got 3): delta +3 → emotion +14 (upset win)
> Strong team vs weak loss (expected 3, got 0): delta −3 → emotion −12 (upset loss)

### Promotion / relegation (one-time ±20, see above)

### 0-100 range (clamped)

- Hits 100 → capped; no further growth from that source
- Hits 0 → floored; no further drop from that source

---

## Emotion display (dashboard)

Fan emotion 0-100 is shown in 10 named tiers (cold → hot):

| Range | Name | Meaning |
|---|---|---|
| 0-10 | Silent | fans don't show up |
| 11-20 | Hollow | sparse home crowd |
| 21-30 | Skeptical | no faith in the team |
| 31-40 | Tense | cautiously hopeful |
| 41-50 | Steady | neutral |
| 51-60 | Warming | turning a corner |
| 61-70 | Heated | getting excited |
| 71-80 | Boiling | packed home |
| 81-90 | Frenzied | city-wide euphoria |
| 91-100 | Inferno | generational |

> The dashboard's "Fans & Morale" card shows the current tier + numeric value.

---

## How fan count affects other systems

### Sponsorship (weekly)

> Details in [chapter 9: Finance](09-finance.md)

- Sponsorship = base (per tier) × **2 × √(fans / 10,000)**
- 2× fans → sponsorship × √2 ≈ ×1.41
- 4× fans → sponsorship × 2

### Ticket sales (per home match)

**Ticket revenue** = attendance × unit price (20) × league multiplier (L1=2.0 / L2=1.6 / L3=1.3 / L4+ 1.0)

**Match attendance** = home fans + away fans. Both sides have a conversion rate:

| Item | Algorithm |
|---|---|
| **Home conversion** | **20% - 50%** (small club 50%, big club 20%) |
| **Away conversion** | **fixed 8%** (travelling fans are pickier) |
| **Emotion modifier** | both sides: 60% + (emotion/100) × 40% = 60-100% |
| **Random fluctuation** | ±5% |
| **Cap** | stadium capacity |

**Small club logic**:
- 10k fans, emotion 60 → conversion 50% × attendance rate 84% = 42% → **4,200 fans show up**
- 300k fans (top club), emotion 80 → conversion 20% × attendance rate 92% = 18% → **54k fans show up** (capped by stadium capacity)

> Top-club fans are saturated (low 20% conversion) — but stadium capacity is the real ceiling. **A small stadium caps everyone.**

---

## How to operate (overview)

- **Check the dashboard** — the "Fans & Morale" card shows current tier + numeric
- **Check team detail** — total fans + emotion + last 5 matches
- **No manual action needed** — weekly tick + post-match update are automatic
- **Push for promotion** — one promotion = +10% fans + 20 emotion (permanent)
- **Don't lose streaks** — loss streak → emotion drops → big clubs lose ~750 fans/week → sponsorship + tickets both drop

---

## Order-of-magnitude (L1 team)

| Stage | Fan count | Emotion | Effect |
|---|---|---|---|
| **Just promoted** | 30k - 50k | 50-60 | tickets 1-2k, sponsorship 10-15k/week |
| **Mid-table (stable)** | 100k - 200k | 50-65 | tickets 3-5k, sponsorship 18-25k/week |
| **Title contender (winning)** | 200k - 300k | 70-80 | tickets 5-8k, sponsorship 25-30k/week |
| **Capped** | 300k (max) | 80-90 | tickets ~8k (capped by stadium), sponsorship 30k/week |

> Once fan count **hits the cap**, growth nearly stops — promotion is the only way out. **Stadium atmosphere** tracks emotion more than fan count.

---

## 5 common mistakes

❌ **"More fans = stable"** — at cap, growth is near zero; top clubs are extremely sensitive to low emotion (−750/week)
❌ **"Win one match → gain fans"** — wins only affect **emotion** (+2 to +14 per match); **fan count changes on the weekly tick**, not per match
❌ **"A losing streak will wipe the fans"** — no, **floor is 1,000**
❌ **"Home ground is always packed"** — top-club conversion is only 20% (saturated fan base); the real ceiling is **stadium capacity + emotion**
❌ **"Small clubs draw no one"** — small clubs have **50% conversion** (core fans almost all show up); big clubs have lower ratios

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Match** (chapter 6) | every match updates emotion; home attendance is driven by fan count + emotion |
| **Finance** (chapter 9) | fan count × league multiplier → sponsorship; attendance → tickets |
| **Stadium** (chapter 11) | attendance **ceiling = stadium capacity** |
| **Promotion / relegation** | one-time ±10% fans + ±20 emotion |

---

## Next

- [chapter 6: Match Basics](06-match-basics.md) — how home attendance is calculated
- [chapter 9: Finance](09-finance.md) — fan count → sponsorship + ticket income
- [chapter 11: Stadium](11-stadium.md) — capacity caps the home crowd
