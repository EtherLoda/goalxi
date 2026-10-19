---
order: 16
slug: subs-and-orders
title: Match: Substitutions and Team Orders
status: full
lastUpdated: 2026-10-19
relatedChapters: [5, 6, 15]
relatedEntries: [condition-form-injury, player-event-types]
---

# Match: Substitutions & Team Orders

Chapter 5 covered **how to set things up** (lineup + bench + how to add an in-match adjustment). This chapter covers the **rules behind those adjustments**: the limits, how conditions are evaluated, when an order gets ignored, how injuries are handled for you, and **how to actually use this in a match**.

One line: **every in-match adjustment is planned before kickoff — once the match starts, you cannot touch anything.** Chapter 15 is about "how the team plays overall"; this chapter is about "when, and who comes on".

---

## 0. Quick reference

| Item | Rule |
|---|---|
| Bench | **6 slots** (may be left empty) |
| **Voluntary substitution limit** | **Max 3 per match** |
| **Injury substitutions** | **Handled automatically by the physio; do NOT count against those 3** |
| **Position moves** | **Unlimited** |
| One adjustment = | minute + condition + (sub: who off / who on — move: who moves where) |
| Trigger conditions | 6 (always / leading / trailing / tied / not leading / not trailing) |
| UI lock | about **30 minutes** before kickoff (editor goes read-only) |
| Server hard lock | about **10 minutes** before kickoff (server rejects the submission) |

---

## 1. The bench (6 slots)

The bench does **not** have to be full (0-6 players) — but the more you fill, the more room you have to change things during the match.

| Bench slot | Who fits |
|---|---|
| Backup GK | any goalkeeper |
| Backup CB | centre-back family (CB / left CB / right CB) |
| Backup FB | full-back / wing-back (covers left / right) |
| Backup W | winger (covers left / right) |
| Backup CM | central midfield / defensive midfield / attacking midfield |
| Backup FW | striker (covers left / centre / right) |

> **The backup GK slot only accepts goalkeepers**, and no other bench slot accepts one. A mismatch is rejected by validation.

**What if you only fill 1 bench slot?** You can still submit, but for the whole match you have exactly one player to bring on — and if he is not in the injured player's position family, injuries cannot be covered either (see section 5).

---

## 2. The two kinds of in-match adjustment

### Substitution (sub)

One **player on the pitch** comes off, one **bench player** comes on.

| Field | Meaning |
|---|---|
| **Minute** | When it triggers (1-90) |
| **Who off** | Any player on the pitch (not one already sent off) |
| **Who on** | A player on the bench |
| **Condition** | One of the 6 (defaults to "always") |

### Position move (move)

Move one **player on the pitch** into an **empty position**.

| Field | Meaning |
|---|---|
| **Minute** | When it triggers (1-90) |
| **Who moves** | A player on the pitch |
| **Move to** | The target position must currently be **empty** |
| **Condition** | One of the 6 |

> A move does **not** cost a substitution slot — queue as many as you like. A move is a **position adjustment**, not a substitution: the same 11 players stay on the pitch.

**The two side by side**:

| | Substitution | Position move |
|---|---|---|
| Costs a slot | ✅ uses 1 voluntary slot | ❌ free |
| Changes the headcount | 1 off, 1 on | no change |
| After it triggers | the player coming on **inherits the outgoing player's position** | moves into the position you named |

---

## 3. The voluntary substitution limit: 3 per match

**This is the most important rule in this chapter.**

A team may make **at most 3 voluntary substitutions** in a single match. It is a hard cap and cannot be exceeded under any circumstances.

### What counts and what does not

| Situation | Counts against the limit? |
|---|---|
| A **substitution** you queued before kickoff | ✅ **yes** (each one costs 1) |
| A **position move** | ❌ no |
| An **injury substitution** (the physio's call) | ❌ **no** |
| A player being sent off | ❌ no (and you cannot replace him) |

### The editor stops you

After 3, the "add substitution" button will not create another row and shows a notice. **The server also rejects** a submission with more than 3 — so do not expect to get around it by editing the request.

### Injury substitutions are free → you can end up making more than 3 in total

The cap governs **your decisions**, not **what happens on the pitch**. In an injury-heavy match you could use all 3 voluntary substitutions **and** see 2 more forced by injuries — **5 players changed in total**. That is by design, not a bug.

### Common misconceptions

❌ **"You can substitute as often as you want"**: **max 3 voluntary substitutions per match**, hard rule.

❌ **"I should save a slot for injuries"**: **no need.** Injury substitutions do not use the limit, so **queue all 3 if you want them**. An unused slot does not carry over and does not turn into extra injury cover.

❌ **"Moves count against the limit too"**: **they do not.** Moves are unlimited.

---

## 4. The 6 trigger conditions

Every adjustment can carry a **condition**. It is evaluated **once, at the start of that minute**: satisfied → it runs; not satisfied → **it is discarded** (it does not wait for a better moment).

| Condition | Meaning |
|---|---|
| **Always** | triggers on time regardless of the score (**default**) |
| **While leading** | only when you are ahead |
| **While trailing** | only when you are behind |
| **While tied** | only when the score is level |
| **While not leading** | when behind or level (the inverse of "while leading") |
| **While not trailing** | when ahead or level (the inverse of "while trailing") |

**Which to pick**:

| What you want to do | Condition to use |
|---|---|
| Change things on time regardless of the score | always |
| Shut up shop once ahead (bring on a holding midfielder) | while leading (or "while not trailing" to do it earlier) |
| Chase the game (bring on a striker) | while trailing (or "while not leading" to do it earlier) |
| Adjust only if it is still level | while tied |

> The **default is "always"**. If you do not set a condition, it fires on time no matter what.

---

## 5. Injury substitutions (forced, and free)

Players get injured during a match, and a serious injury **means they must come off**. You do not arrange these:

1. The physio assesses the injury. **Mild** → the player can carry on. **Serious** → he **must come off**.
2. The engine automatically looks for a bench player in the **same position family** and brings him on.
3. **No bench option** → the player simply goes off and **the team plays a man down** (you will see it in the post-match events, marked as an injury with nobody available).
4. An injury substitution **does not use one of your 3 voluntary slots**.

**So do not leave the bench nearly empty.** Which position family gets hit is random; the fuller the bench, the less likely you are to end up a man down.

> **Injury substitutions ignore your orders** — the engine decides them live during the match, and the order in which you queued substitutions has no effect on them.

---

## 6. Submitting and locking

| State | What happens |
|---|---|
| More than 30 minutes before kickoff | change anything (lineup / bench / adjustments / tactics) |
| About **30 minutes** before | **UI lock**: editor becomes read-only, with a countdown |
| About **10 minutes** before | **server lock**: new submissions are rejected |
| Match in progress | **locked**, nothing can change |
| Match finished | history, nothing can change |

> **In-match adjustments are part of the tactics submission**, so the same two locks apply — this is not something you can edit live once the match has started.

---

## 7. Set-ups that work (5 common patterns)

### 1. Protect a lead

- Minute 60-70 / **while leading** / bring off an attacker, bring on a holding midfielder or centre-back
- Pairs with "narrow + low line" from chapter 15, or 防守反击 (Counter) from chapter 28

### 2. Chase the game

- Minute 55-65 / **while trailing** / bring off a defender, bring on a striker
- Pairs with "wide + high line", or 高位逼抢 (High Press) from chapter 28

### 3. Running on empty

- Minute 65-75 / **always** / bring off your lowest-stamina player (usually the one being overrun)
- This one does not care about the score, so "always" is the simplest choice

### 4. Injury insurance

- Fill the bench **completely (6)**, above all GK + CB + CM
- You can rely on the physio even with no substitutions queued, and queued voluntary substitutions do not interfere with injury substitutions

### 5. Playing a man down

- You **cannot replace** a sent-off player; you can only use queued moves to pull the shape back
- For example: after a red card, minute 70 / **always** / move a winger back to a full-back position

---

## 8. What you cannot do (yet)

- **No live in-match control** — there is no "pause → click substitution" interaction. Everything is queued before kickoff.
- **No formation change** — moves can shift players, but you cannot turn a 4-3-3 into a 5-3-2.
- **No automatic reshuffle after a red card** — the shape stays as it was when you go a man down, so use moves to cover for it.
- **No substitution windows** — only the **total** matters (3 players), not how you spread them across the match.
- **You cannot substitute a player who has been sent off** — he is already off the pitch.
- **A substituted player cannot come back on** — one substitution = one player off the pitch, one bench player on.

---

## 9. Common misconceptions

❌ **"Substitutions are unlimited"**: **max 3 voluntary substitutions per match**.

❌ **"Injury substitutions use the limit too"**: **they do not.** Those 3 slots only count the substitutions you queued.

❌ **"If it is queued, it happens"**: an unmet condition → **discarded**; the player coming off is no longer on the pitch → **the order does nothing**; the move target is already occupied → **does nothing**.

❌ **"I can still edit after the lock"**: once the UI is locked, stop trying — the server starts rejecting about 10 minutes before kickoff.

❌ **"I can replace a sent-off player"**: **you cannot.** You play a man down and cover with moves.

❌ **"The bench does not matter"**: you can submit, but **the thinner the bench, the more likely an injury leaves you a man down**.

---

## 10. What the editor looks like

The pre-match screen arranges the same content in two different ways depending on your screen width.

**Desktop (wide): two tabs at the top**

| Tab | What is in it |
|---|---|
| **Lineup** | Pitch and bench on the left, squad list on the right — drag from either side to the other |
| **Tactics & changes** | Pitch width / defensive line and the five team tactics on top; the **substitution plan** below (collapsed by default, the header says "2 scheduled") |

- The header spells out your current setup, e.g. `4-4-2 · Narrow · Low line · Wings`, so you never have to switch tabs to check
- The **Presets** button at the top right opens a drawer — save, apply and delete all live in there, out of the way the rest of the time
- Switching tabs **loses nothing**; unsaved changes stay put

**Mobile: three steps at the bottom**

`① Lineup → ② Tactics → ③ Changes`, with a fixed bottom bar showing **Back** and **Next**; on the last step the button becomes **Submit tactics**.

> The steps are not a form you must fill in order — they are the same form cut into three screens, and you can walk back at any time.

**Keyboard works too**(no mouse needed)

| To do this | Press |
|---|---|
| Put a squad player on the pitch | **Enter** on an empty slot, pick from the list |
| Move a player already on the pitch | **Enter** to pick up → **arrows** to walk → **Enter** to drop |
| Jump to another slot | **Arrow keys** (focus goes to the nearest slot) |
| Cancel a pick-up | **Esc** |

Filling all 11 slots, choosing a tactic and submitting needs no pointer at all.

---

## Related chapters

- [Chapter 5: Lineup Basics](05-lineup-basics.md) — lineup + bench + adding an adjustment
- [Chapter 6: Match Basics](06-match-basics.md) — what you can see during a match
- [Chapter 15: Match Tactics](15-tactics.md) — the 2 tactical dimensions (width / line) plus team tactics
- [Chapter 28: Team Tactics](28-team-tactics.md) — picking one of the five team tactics
- [Chapter 14: Set Pieces & Special Events](14-set-pieces.md) — cards / injuries / offside
