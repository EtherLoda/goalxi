---
order: 11
slug: stadium
title: Stadium
status: full
lastUpdated: 2026-08-30
relatedChapters: [9, 10]
relatedEntries: []
---

# Stadium

Stadium capacity caps **home-match ticket revenue** and sets **weekly maintenance cost**. Big enough to seat your fans; too big and the upkeep eats you. This chapter covers queueing expansions, demolitions, and the rebuild trade-off.

> Ticket math is in [chapter 6: Match Basics](06-match-basics.md) + [chapter 10: Fans](10-fans.md). Maintenance + construction costs are in [chapter 9: Finance](09-finance.md).

---

## Stadium fields

Each team has one stadium with 3 fields:

| Field | Meaning | Default | Range |
|---|---|---|---|
| **Capacity** | how many seats | 5,000 | 1,000 - 200,000 |
| **Name** | shown in news / match list | "Home Stadium" | custom |
| **isBuilt** | has a stadium | true (every team has one) | true / false |

New teams **start with a 5,000-seat stadium** — no "build it first" step.

---

## How to queue a project (not instant)

Stadium expand / demolish **goes through a project queue**, not an instant effect. Flow:

1. Stadium page → click "**Queue Expand**" or "**Queue Demolish**"
2. Drag the slider to pick **seats** (500 - 100,000 step, min 500)
3. Preview shows: **current capacity / next capacity / cost / refund on completion / build weeks**
4. Confirm → **funds deducted immediately** (expand) / **refund paid on completion** (demolish)
5. Project queued → weekly settlement tick advances 1 week
6. On completion: **auto-update capacity** + notification (finance page / dashboard)

> **Only one project at a time** — if one is in progress, the button prompts "an active project is already running, wait for it to finish".

---

## Build speed (one week tick at a time)

| Project type | Speed | Example |
|---|---|---|
| **Expand** | **5,000 seats/week** | +10k seats = 2 weeks / +50k seats = 10 weeks |
| **Demolish** | **10,000 seats/week** (faster than build) | −10k seats = 1 week / −50k seats = 5 weeks |

Minimum 1 week for any size.

---

## Costs

| Item | Unit price | Notes |
|---|---|---|
| **Build / expand** | **50 coins/seat** | deducted immediately |
| **Partial demolish** | **15% refund** | paid on completion |
| **Full demolish** | **30% refund** | one-shot |
| **Rebuild** (full demo + new build) | 50 coins/seat (new) | net 70% × new cost after 30% refund |
| **Rename** | **free** | takes effect immediately |

### Worked examples

- **+10,000 seats** → 50 × 10,000 = **500k coins** (2 weeks)
- **−10,000 seats** → 50 × 10,000 × 15% = **75k coins** back at completion (1 week)
- **Full demo 50,000 seats** → 50 × 50,000 × 30% = **750k coins** back
- **Rebuild 50,000** → 750k refund − 2.5M new build = **net 1.75M coins**

---

## How capacity affects other systems

### Caps home attendance (per match)

Home fans (conversion 20-50%) + away fans (conversion 8%) = **attendance**, but **capped at capacity**. Details in [chapter 6: Match Basics](06-match-basics.md) + [chapter 10: Fans](10-fans.md).

```
Home 200k fans (top club, 20% conversion) + Away 100k fans (8%) = 40k + 8k = 48k
→ 50k stadium, fits
→ 30k stadium, capped at 30k
```

> **A small stadium caps ticket income.** A big club in a small stadium leaves money on the table.

### Sets weekly maintenance cost

**Maintenance = capacity × 2 coins/week** (mentioned in [chapter 9: Finance](09-finance.md))

- 5,000 capacity → 10k/week
- 50,000 capacity → 100k/week
- 200,000 capacity → 400k/week

> Doubling capacity doubles the upkeep. **Excess capacity = wasted money.**

### Sets matchday revenue preview

**Preview = capacity × 20** (ticket unit price, see chapter 9). The Stadium page's "Matchday revenue" tile shows this.

---

## What the Stadium page shows

Go to "Club" → "Stadium":

- **Stadium visual** (occupancy rendered as lit seats, hashed by row)
- **Last home match fill rate** (%)
- **Season average attendance** (this season's completed home matches)
- **Last 6 home matches** (opponent / score / attendance / fill / result)
- **Current capacity** + **matchday revenue preview**
- **Active projects** + **weeks to completion**
- **Queue Expand / Demolish** button → opens the project dialog
- **Rename** button → opens rename dialog

---

## How to operate (overview)

1. **Check stadium** — capacity + fill rate + matchday revenue
2. **Check the project queue** — anything building? How many weeks left?
3. **Expand** — queue expand → pick seats → preview cost + weeks → confirm → funds deducted now
4. **Demolish** — queue demolish → pick seats → preview refund + weeks → confirm → refund at completion
5. **Rename** — change stadium name (free, instant)
6. **Wait for completion** — weekly settlement tick advances 1 week
7. **On completion** — capacity auto-updates, notification in finance page

---

## 5 common mistakes

❌ **"Bigger is always better"** — capacity ↑ = tickets ↑ but **maintenance ↑** too. Match capacity to your actual fan base
❌ **"Expand changes capacity immediately"** — no, it's **queued + weekly**; during the build, capacity stays the same
❌ **"Demolish refunds the full cost"** — **partial demo = 15%**, **full demo = 30%**; **always full-demo if you want to shrink** (better refund rate)
❌ **"Can I queue multiple projects at once?"** — **No, one at a time** — the first one must finish before the next can start
❌ **"Match capacity to fan cap"** — fan cap for L1 is 300k; **don't go above what your fans actually fill** (L1 stadium over 100k usually has empty seats)

---

## Order-of-magnitude (L1 team)

| Stage | Capacity | Maintenance/week | Matchday revenue (full) | Suitable for |
|---|---|---|---|---|
| **Just promoted** | 5k-20k | 10k-40k | 100k-400k | start at 5k, expand slowly |
| **Mid-table** | 20k-50k | 40k-100k | 400k-1M | match the fan base |
| **Title contender** (full) | 50k-100k | 100k-200k | 1M-2M | at L1 fan cap 300k |
| **Top club** (full + packed) | 100k-200k | 200k-400k | 2M-4M | rare, years to build |

> **Maintenance is the hidden tax**: 100k capacity = 100k/week maintenance = **5M/season** just to keep the seats.

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Match** (chapter 6) | home attendance = min(home + away fans, capacity) |
| **Finance** (chapter 9) | construction / demolish / maintenance are expenses |
| **Fans** (chapter 10) | fan count drives home conversion; capacity is the ceiling |

---

## Next

- [chapter 6: Match Basics](06-match-basics.md) — how attendance is calculated
- [chapter 9: Finance](09-finance.md) — construction + maintenance budget impact
- [chapter 10: Fans](10-fans.md) — fan count vs capacity: which is the bottleneck
