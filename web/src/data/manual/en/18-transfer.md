---
order: 18
slug: transfer
title: Transfer Market
status: full
lastUpdated: 2026-09-02
relatedChapters: [3, 9]
relatedEntries: [release-list-player, comparing-two-players, pwi-vs-overall, experience-meaning]
---

# Transfer Market

The transfer market is the combination of **listing a player**, **auction**, and **settlement**. Both buying and selling happen here.

This chapter covers **how to list, how to bid, how the auction flows, what happens after it ends**, and **what you can / can't do today**. The buy-side framework (PWI / headline skills / injury / form / experience / 28+ decay) lives in [Chapter 4](04-player-attributes.md) and the `comparing-two-players` FAQ entry.

---

## 1. Two ways to list

GoalXI has **two ways to put a player on the market** — they do different things:

| Method | What it does | Bid mechanism? | Use it for |
|---|---|---|---|
| **Quick list** | Sets `onTransfer = true`, **no price** | ❌ No one can bid | Probe / "I might sell" signal |
| **Auction** | Creates an auction with **start price + buyout price + duration** | ✅ Other teams bid, ends at the timer | **Actual selling** |

**Key difference**:
- Quick list = **no concrete price**, other teams **don't see a bid button**, only "ask" (no ask-UI today)
- Auction = has a price, other teams can bid formally
- An auction **doesn't cancel** until the timer ends; **the seller can't pull it early** (prevents flip-flopping)
- **One player can be in at most one active auction at a time** — if there's already an ACTIVE auction, you can't start another

> **In practice, just use the auction**. Quick list is barely useful in the current build (no ask-UI), so most players won't touch it.

---

## 2. As the seller — listing

### Creating an auction

The player must be **on your team** (not youth, not the opponent). Call `POST /transfer/auction`:

| Field | Required | Meaning | Typical values |
|---|---|---|---|
| `playerId` | ✅ | Your player's id | — |
| `startPrice` | ✅ | Start price (first bid must be ≥ this) | **You set it manually** (there's no PWI→price formula, see Chapter 4) |
| `buyoutPrice` | ✅ | Instant-buy price | **Must be > `startPrice`** (server-enforced) |
| `durationHours` | ❌ | Auction length | Default **1 hour** |

> **Important facts**:
> - **Both the start price and the buyout price are set manually**; the engine doesn't auto-compute a PWI-based price
> - The player's `currentWage` **doesn't auto-adjust on transfer** — fixed at generation, stays put
> - **No fee** — 100% of the final price goes to the seller

### After the auction is created

- The player's `onTransfer` flag is auto-set to `true`, until the auction ends / is cancelled
- The player **stays on your team**, but other teams can see + bid on them
- The player **can still play** — listing doesn't affect match selection

### During the auction (seller view)

The seller can see:
- **`GET /transfer/auction/my-listings`** — all auctions you've listed
- Current price / current high bidder (shown as a "team", not detailed)
- **Bid history** (full record, including your own past bids)
- Countdown (system cron polls every minute)

The seller **cannot**:
- ❌ Cancel the auction (it ends naturally when the timer hits 0, or expires without bids)
- ❌ Change the price (start / buyout are locked)
- ❌ End the auction early

---

## 3. As the buyer — bidding

### Browsing auctions

**`GET /transfer/auction`** lists all in-flight auctions (ACTIVE + SETTLING). For each auction you see:
- The player (skills / PWI / potential / specialties / age / injury — see [Chapter 4](04-player-attributes.md))
- Current price / start price / buyout price
- Current high bidder (team name only)
- **Countdown** (may be extended by a last-minute bid, see below)
- Bid history

### How to bid

`POST /transfer/auction/:id/bid` with an `amount`:
- **First bid** = ≥ `startPrice`
- **Subsequent bids** = ≥ `currentPrice + minIncrement`
- **minIncrement** = `max(10,000, 5% of currentPrice)` (the larger of an absolute floor and a 5% ratio)
  - Example: current 100,000 → next bid ≥ 105,000 (the 5% wins)
  - Example: current 50,000 → next bid ≥ 60,000 (the 10,000 floor wins)
  - Example: current 200,000 → next bid ≥ 210,000

**Money flow on bid**:
- On bid, the system **doesn't deduct** from your account — it **locks** the amount (`lockedCash += amount`; available = balance − locked)
- You **lose** (outbid): the lock is released, money returns to your account
- You **win** (auction settles): the lock becomes a real deduction, money goes to the seller

> **Pro**: you can still spend the rest of your money elsewhere after bidding (the bid is "frozen", not "spent")
> **Risk**: when your lockedCash + new bid exceeds your balance, the server rejects ("Insufficient funds")

### Bidding on your own player's auction ❌

Server-enforced: you **cannot** bid on an auction you listed (anti money-laundering). Returns 400.

### Last-3-minute extension

**Hattrick-style last-minute extend**:
- A bid that lands in the **last 3 minutes** auto-extends the auction by 3 minutes
- This re-triggers — every bid in the final 3 minutes resets the clock
- Until **no one bids** in the new 3-minute window

> Purpose: prevent last-second snipes. If you bid in the final 3 minutes, the seller has more time to react.

### What you see after bidding

- **currentBidder === you** → you're leading
- **currentBidder !== you, but you've bid before** → **outbid** (`isOutbid = true`). You can **bid again** to retake the lead
- **currentBidder !== you, you've never bid** → someone else is leading, you can **bid for the first time**
- **`GET /transfer/auction/my-bids`** — every auction you've bid on, with leading / outbid state

### Buyout (instant buy)

> **Currently disabled**. `auction.constants.ts:13` `BUYOUT_ENABLED: false`
>
> The **data layer** (column / DTO / auction row) is still in place (so future work can re-enable without a migration), but **no API endpoint accepts it**. The buyout UI needs to be ready before this gets turned on.
>
> The only "instant win" path today is **waiting for the auction to end naturally**.

---

## 4. Auction lifecycle (state machine)

Each auction has 5 states (`AuctionStatus`):

```
ACTIVE ───(timer / cancel)──→ EXPIRED / CANCELLED
   │
   ├──(timer + bid exists)──→ SETTLING ──(settlement worker)──→ SOLD
   │
   └──(timer + no bids)──→ EXPIRED
```

| State | Meaning | What you can do |
|---|---|---|
| **ACTIVE** | In progress, can bid | Buyers bid / seller waits |
| **SETTLING** | Timer hit 0, there's a winning bid, **settlement worker is processing** | Wait (usually seconds to minutes) |
| **SOLD** | Settled — player has moved to the buyer's team | See the transaction / player event |
| **EXPIRED** | Timer hit 0, **no bids** — went unsold | Player's `onTransfer = false`, available again |
| **CANCELLED** | (Unused today, reserved for future) | — |

**SETTLING → SOLD in detail**:
- A cron job scans ACTIVE auctions every minute (max 500 / tick, 8 in parallel)
- The settlement worker, in one transaction:
  1. Creates a `TransferTransaction` record (`AUCTION_COMPLETE` / `PENDING` → `PROCESSING` → `COMPLETED`)
  2. Updates the player's `teamId` to the buyer
  3. Converts the buyer's `lockedCash` into a real deduction
  4. Adds the seller's account balance
  5. Writes a `TRANSFER` event to the player's event history
- **If the worker crashes mid-settlement**, a recovery cron every 5 minutes picks up SETTLING rows older than 10 minutes and re-enqueues them
- **What the FE sees**: during SETTLING, the auction still shows; 1-2 minutes later it flips to SOLD (player is on the new team)

---

## 5. What you see after a sale

### Transaction history

- **`GET /transfer/transactions/purchases`** — players you've bought
- **`GET /transfer/transactions/sales`** — players you've sold
- Each `TransferTransaction`:
  - Type: `AUCTION_COMPLETE` (only this for now; `BUYOUT` is kept for future use while disabled)
  - Status: `PENDING` / `PROCESSING` / `COMPLETED` / `FAILED`
  - Amount: the final price
  - Buyer / seller team ids
  - Season / week

### Player event history

- Player detail page → Events area gets a `TRANSFER` event entry
- It sits alongside `HAT_TRICK` / `GOLDEN_BOOT` / etc. (see Chapter 4 `player-event-types` FAQ)
- Records "when moved to new team", not the bidding process

### Financial impact (see [Chapter 9](09-finance.md))

- **Buying** = money from your account to the seller's (`TRANSFER_OUT` for you, `TRANSFER_IN` for the seller)
- **Player's `currentWage` doesn't change** — fixed at generation, persists after transfer
- No fees

---

## 6. What you can / can't do today

### ✅ Can

- Mark any senior player on your team as `onTransfer` (quick list, no price)
- Create an auction (start price / buyout price / duration)
- Bid multiple times during one auction (outbid can re-bid)
- Last-3-minute extension (Hattrick-style)
- Bid locks your cash instead of deducting it
- Bid across teams (other teams' auctions)
- View transactions + player `TRANSFER` event after the sale

### ❌ Currently can't / not implemented

- **Buyout (instant buy)** — `BUYOUT_ENABLED: false`, the column is there but the endpoint is off
- **Player contract renewal** — `CONTRACT_RENEWAL` is a player event **type**, but **no API endpoint generates it**; player wages are set at generation, never change
- **Cancel an auction** — once started, it runs to completion
- **Ask / negotiate** — no UI for "how much will you sell for" on a quick list
- **Cross-league transfers** — same-league only (in `TODO` state for a future version)
- **Player-for-player swaps** — not implemented
- **Loans** — not implemented
- **Borrow when short on cash** — not implemented, an insufficient balance just rejects the bid
- **Tax / fees** — none, 100% of the final price goes to the seller

### Releasing a youth (different from listing)

- A youth player **cannot** go through the auction
- Use the dedicated `POST /players/:id/release` endpoint (soft-delete, see [Chapter 4](04-player-attributes.md))
- After release the player is gone from your squad, but the **row stays in the DB** (link in Chapter 4)

---

## 7. How to price (seller's perspective)

GoalXI has **no PWI→price auto-formula** (see [Chapter 4](04-player-attributes.md)). You set both numbers.

### Reference pricing framework (not a formula — experience)

| Player | Start price range | Buyout price range |
|---|---|---|
| **Bench player** (PWI 8-10) | 5,000 - 20,000 | 20,000 - 50,000 |
| **Starter** (PWI 12-14) | 50,000 - 150,000 | 200,000 - 500,000 |
| **Star** (PWI 15+) | 200,000+ | 500,000+ |
| **Rookie** (PWI < 8) | 1,000 - 5,000 | 5,000 - 20,000 |

> These are **experience ranges**, not engine-enforced. You can ask whatever you want; if it's too high, the auction **expires with no bids**.
> The player's wage (`currentWage`) **doesn't influence** the auction price (see Chapter 4).

### How to list (your call)

- **Want a fast sale** → start price near the low end of the market range, more buyers but lower final price
- **Want a high price** → high start price, may expire without bids
- **Insurance** → buyout = 2-3× start price, lets a "must-have now" buyer win instantly (but the buyout endpoint is off today, so this insurance doesn't kick in)
- **Walk-away price** = your psychological floor; if the start price is below this, the auction will probably expire

---

## 8. How to buy (buyer's perspective)

**See** the `comparing-two-players` FAQ entry (11 dimensions: headline skills / potential / injury / form / experience / wage / 28+ decay / specialty match / price, etc.).

### Practical flow

1. **Go to `/transfers`** — see all ACTIVE + SETTLING auctions
2. **Filter** — by position, PWI, headline skills, age, specialty
3. **Pick 1-2 candidates** — compare within the same position (`comparing-two-players`)
4. **Check injury / form / experience** — short-term impact vs long-term value
5. **Check bid history** — is the price inflated by a bidding war?
6. **Bid**:
   - **Market price** → start price + a bit
   - **Must-have** → bid all the way to buyout (wait 1 hour)
   - **Snipe** → bid in the **last 1-2 minutes** (but last-minute extend gives the seller a window to react)
7. **Outbid?** — decide if you want them, **re-bid** or walk away
8. **Settled** — wait 1-2 minutes for SETTLING → SOLD, player arrives on your team

### Bidding strategies

- **Unwanted player** → bid at start price (no one competes)
- **Hot player** → bid early, force others to keep raising
- **Last-1-minute snipe** → bid, wait for the 3-min extension (gives you time to see if anyone counters)
- **Don't blow your budget** → too much lockedCash means you miss other bidding opportunities

---

## 9. Common mistakes

❌ **"Set a start price and someone will buy"**: **no bids → EXPIRED**. Too high a start price = no sale.
❌ **"Buyout = guaranteed price"**: **buyout endpoint is off today**; buyout only works when the auction timer naturally hits 0.
❌ **"Bidding deducts the money"**: bidding **locks** (`lockedCash`); outbid releases the lock.
❌ **"Auction ends → auto-sold"**: not auto. The worker cron polls every minute; SETTLING takes 1-2 minutes before SOLD.
❌ **"I can end the auction early"**: **you can't**. It runs from start to end.
❌ **"Listed forever"**: **won't**. EXPIRED (no bids) sets `onTransfer = false`, player is available again.
❌ **"Once I bid, I get the player"**: you can be outbid; check `my-bids` to see if you're leading.
❌ **"Cross-team deals = DM each other"**: everything goes through `/transfers`; **no** DMs / negotiations.
❌ **"High PWI = high price"**: **not automatic**. High-PWI listings **may** be priced high (seller's psychology), but PWI and price have **no formula**.
❌ **"Wage changes on transfer"**: **doesn't change**. Wage is fixed at generation, persists after transfer.
❌ **"Buyout is the floor"**: **currently disabled**; the floor is "sell for 0" (expire).
❌ **"Quick list gets inquiries"**: **no ask-UI today**; quick list is barely useful.

---

## 10. How to use the transfer market (overview)

### Selling in 4 steps

1. Pick a player (only sell if you have a same-position replacement, see Chapter 5)
2. Decide a price (see Section 7)
3. Create the auction
4. Wait 1 hour (or longer, with last-minute extension), check `my-listings` and `transactions/sales`

### Buying in 4 steps

1. From your coach / scout notes, decide **what position + what headline skills** you need
2. Filter `/transfers`, pick 1-2 candidates
3. Apply the `comparing-two-players` framework
4. Bid (3 strategies for cold / hot / snipe, see Section 8)

### When to sell

- **Start of season** — squad overhaul, many listings
- **Mid-season** — fringe bench players / high-wage veterans (28+ decay), sell while they still have value
- **Never** — selling your starting star, unless you have a clear rebuild plan

### When to buy

- **Start of season** — reinforce, budget is full, choices are wide
- **Mid-season** — patch injury / form, **buy deliberately** (a player who can't play right away is a loss)
- **End of season** — not recommended, prices are inflated (everyone else is patching too)

---

## How this connects to other concepts

| Concept | Connection |
|---|---|
| **Player attributes** (Chapter 4) | Buying checks PWI / headline skills / injury / form / experience / 28+ decay / wage (all the same-position compare inputs) |
| **Lineup** (Chapter 5) | Before selling, **make sure you have a same-position replacement**, or you'll have a hole in the XI |
| **Finance** (Chapter 9) | Transactions → cash in / out, but wage persists (transfer doesn't change wage) |
| **Player event history** (`player-event-types` entry) | After a sale, the player detail page logs a `TRANSFER` event |
| **Youth players** | Use the dedicated `release` endpoint (see Chapter 4); **doesn't go through the auction** |
| **Scout** | Scout is **a supplement, not a replacement** — scout candidates land in the `onTransfer = false` pool; you still need to list them to start an auction |

---

## Next

- [Chapter 3: Player Positions](03-positions.md) — same-position compare, headline skills
- [Chapter 4: Player Other Attributes](04-player-attributes.md) — how to read PWI / headline / injury / 28+ decay
- [Chapter 5: Lineup Basics](05-lineup-basics.md) — make sure you have a replacement before selling
- [Chapter 9: Finance](09-finance.md) — transfer in / out ledger
- [Chapter 19: Youth Players](19-youth-and-scouts.md) — youth don't go through the auction, use `release`
