---
order: 9
slug: finance
title: Finance
status: full
lastUpdated: 2026-08-30
relatedChapters: [8, 10, 11, 18]
relatedEntries: [comparing-two-players]
---

# Finance

The team earns and spends money — this chapter covers **where the money comes from, where it goes, and how to avoid going broke**.

> Stadium build / expansion is in [chapter 11: Stadium](11-stadium.md). Buy / sell players is in [chapter 18: Transfer](18-transfer.md). Coach wages / signing fees are in [chapter 8: Coaches](08-staff.md).

---

## Currency

- **Only currency in-game**: **Goalxi Coin**
- No gold / diamond / euro — single currency only
- **Starting budget**: **100,000**

---

## Weekly settlement (automatic)

**Every week** the system runs a settlement that adjusts your wallet.

### Income (weekly)

| Item | Source | Notes |
|---|---|---|
| **Sponsorship** | paid weekly by league tier | L1 base = 100k/week, L5 = 30k/week (tier down → less) |
| **Ticket sales** | after every home match | attendance × unit price × league multiplier |
| **Other income** | misc | rare |

**Sponsorship** scales with fan count (base × 2 × √(fans / 10,000)). **L1 + lots of fans = strong income**.

**Tickets** only land on **home match** weeks. L1 ticket multiplier is 2.0 (most expensive), L4+ is 1.0.

### Expenses (weekly)

| Item | Who pays | Notes |
|---|---|---|
| **Player wages** | 11+ starters | sum of each player's `currentWage` |
| **Coach wages** | head + fitness + specialised | **head coach ×2**; 2k-25k/week by level |
| **Youth team** | all teams | flat 25,000/week |
| **Stadium maintenance** | teams with a built stadium | capacity × 2/week |

**Player wages** are the biggest fixed cost. Higher skill = higher wage.

**Coach wages**: 5 levels, 2k-25k/week. **Head coach ×2** on top of level (L1 head = 4k, L5 head = 50k).

**Youth team** 25k/week **regardless of whether you've signed any youth players** (the background system runs anyway).

**Stadium maintenance** only applies to teams **with a built stadium**. **No stadium = 0**.

---

## One-off income / expenses

Recorded only when they happen:

| Event | Item | Notes |
|---|---|---|
| Season-end ranking | **Prize money** | L1 champion 6M, 8th place 1M; L5 champion 1.2M, 8th place 200k |
| Sell a player | **Transfer income** | sale price |
| Buy a player | **Transfer expense** | purchase price |
| Hire a coach | **Signing fee** | weekly wage × 16 |
| Fire a coach | possible **termination fee** | depends on remaining contract |
| Build / expand stadium | **Construction cost** | big one-time cost, see chapter 11 |
| Forfeit | 0 | opponent gets 3-0 walkover |

---

## Prize money (5 league tiers)

**At season end** (week 16), you get paid by final position:

| League | 1st | 2nd | 3rd-4th | 5th-8th |
|---|---|---|---|---|
| **L1** | 6,000,000 | 3,600,000 | 2,000,000 | 1,000,000 |
| **L2** | 4,000,000 | 2,400,000 | 1,300,000 | 640,000 |
| **L3** | 2,400,000 | 1,440,000 | 800,000 | 400,000 |
| **L4** | 1,600,000 | 960,000 | 520,000 | 260,000 |
| **L5+** | 1,200,000 | 720,000 | 400,000 | 200,000 |

> Champion prize ≈ 5-10 weeks of sponsorship + tickets. **9th place and below get nothing** (but still play the next season).

---

## How to read it (Finance page)

Go to "Club" → "Finance":

- **Current budget**: live updates
- **Live sync**: this week / last week breakdown
- **Income breakdown**: sponsorship, tickets, transfers, other
- **Expense breakdown**: player wages, coach wages, youth, transfers, maintenance
- **Financial trend**: last 8 weeks income / expense
- **Cash-flow analysis**: weekly average / year-end projection
- **Filter by season + week**: any historical week
- **Detailed history**: every transaction with description

---

## Order-of-magnitude (typical team)

**L1 mid-table** (average players + mid coaches):

| Item | Weekly amount |
|---|---|
| Sponsorship | ~100k-200k (fan-dependent) |
| Tickets (home match week) | ~50k-150k (attendance-dependent) |
| Player wages | 30k-80k (squad-dependent) |
| Coach wages | 10k-30k (level-dependent) |
| Youth team | 25k |
| Stadium maintenance | 10k-30k (capacity-dependent) |
| **Net weekly (home match)** | ~80k-180k |
| **Net weekly (away match)** | ~10k-60k (no tickets) |

**Per season (16 weeks)** rough estimate:
- L1 mid-table: **net 1-2M / season**
- Add ranking prize (4th-8th): + 1-2M
- **Total season income ~2-4M**

> vs L1 champion 6M: **one champion season ≈ two runner-up seasons**. Mid-table lives on stable income, champions live on prizes.

---

## 5 common mistakes

❌ **"100k starting balance is a lot"** — looks big, but **a single S-tier coach signing = -2M**, a single skill-18 player = -500k-1M, a few moves and you're broke
❌ **"Prize money is easy"** — **only 8th place earns 1M**. 9th+ = 0. Mid-table teams live on **sponsorship + tickets**, not prizes
❌ **"No income on away weeks"** — no tickets, but **wages still pay, youth still deducts, coaches still deduct** — pure-expense week
❌ **"Coach wages only count what you hired"** — no, **head + fitness + all specialised coaches + all players** are counted
❌ **"Youth doesn't deduct if I didn't sign anyone"** — it does, 25k/week, regardless of youth activity

---

## How to avoid going broke

- **Compare total season income vs total expenses**, keep a **2-3 season buffer** for emergencies
- **Don't load the squad with skill-18 players** — wages scale with skill, **skill-16 starters are much cheaper**
- **Check the wallet before signing** — S-tier coach signing = 2M, ≈ a mid-table L1 team's full season income
- **Don't expand the stadium carelessly** — capacity ↑ = tickets ↑ = maintenance ↑ (**no stadium = 0 maintenance**)
- **Upgrade your squad after you collect the season-end ranking prize**

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Coaches** (chapter 8) | wages + signing fees + termination fees — the three big coach expenses |
| **Stadium** (chapter 11) | build / expand = big one-time cost; maintenance is weekly |
| **Match** (chapter 6) | tickets = attendance × unit price × league multiplier |
| **Fans** (chapter 10) | fan count ↑ → sponsorship bonus ↑ (formula-driven) |
| **Transfer** (chapter 18) | sell = income, buy = expense |
| **Ranking prize** | tied to position + league; one payment per season |

---

## Next

- [chapter 8: Coaches](08-staff.md) — coach wages, signing fees, termination fees
- [chapter 10: Fans](10-fans.md) — how fan count affects sponsorship
- [chapter 11: Stadium](11-stadium.md) — build / expand / maintenance
- [chapter 18: Transfer](18-transfer.md) — buy / sell player money flows
