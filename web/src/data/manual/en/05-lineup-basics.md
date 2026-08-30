---
order: 5
slug: lineup-basics
title: Lineup Basics
status: full
lastUpdated: 2026-08-30
relatedChapters: [2, 3, 4, 6, 14, 15, 16, 19]
relatedEntries: [position-keys-glossary, skill-priority-w, skill-priority-cb, skill-priority-cm-dm-am, skill-priority-cf, skill-priority-gk, player-event-types]
---

# Lineup Basics

Before every match, you set a **lineup** for your team. The lineup decides: who starts, who sits on the bench, what formation you use, what tactical style you play, and when (if ever) you swap players or shift positions during the match.

A complete lineup has five parts:

- **Starting XI** — 9 to 11 pitch players (1 GK required, no duplicates)
- **Bench** — 6 bench slots (one sub per slot)
- **Formation** — pick a template (e.g. 4-3-3, 4-4-2)
- **Tactical style** — tempo, pitch width, defensive line, 3 options each
- **Tactical events** — pre-scheduled subs / position moves triggered by minute + condition (optional)

> This chapter covers **how to set a lineup**. For positions and headline skills, see [chapter 3](03-positions.md). For how each attribute affects a match in progress, see [chapter 6](06-match-basics.md).

---

## Starting XI

The **starting XI = 9 to 11 pitch players**, each in a specific position slot.

**Hard rules**:
- **One GK is required** in the GK slot (only a GK can take GK; a GK can't take any other slot)
- **9–11 players**: fewer than 9 or more than 11 fails the submit
- **No duplicates**: one player can't occupy two slots
- **All players must belong to your team**: bench / youth / opponent players don't count

**Slot layout**: comes from the chosen formation template (see below). Different formations use different slot sets.

> Which skills matter for each position is in [chapter 3](03-positions.md). For GKs the 9-skill set, for outfielders the 10-skill set — every skill contributes at the position it's slotted into.

---

## Bench

**6 bench slots**, one substitute per slot:

| Slot | Covers |
|---|---|
| Bench GK | any goalkeeper |
| Bench CB | the centre-back family (CBL / CB / CBR) |
| Bench FB | fullbacks and wing-backs (both sides) |
| Bench W | wingers (both sides) |
| Bench CM | central / defensive / attacking midfielders |
| Bench FW | centre-forwards (CFL / CF / CFR) |

> The bench **doesn't have to be full**. But the more you fill, the more swaps you have available during the match.

**Bench slot rules**:
- Bench GK can only hold a goalkeeper
- Other bench slots accept any same-family player (e.g. one centre-back fits both Bench CB and Bench FB)

---

## Formations (10 templates)

GoalXI provides **10 standard formations**. Pick one and the editor lays out the 11 position slots for you.

| Formation | Defenders | Midfielders | Forwards | Character |
|---|---|---|---|---|
| **4-4-2** | 4 | 4 | 2 | classic balance, two up top |
| **4-3-3** | 4 | 3 | 3 | wingers stretch the field |
| **4-2-3-1** | 4 | 2 + 3 | 1 | double pivot + attacking mid, defensively solid |
| **4-1-4-1** | 4 | 1 + 4 | 1 | single pivot, flat midfield four |
| **4-3-2-1** | 4 | 3 + 2 | 1 | dense midfield, two AMs roam |
| **3-5-2** | 3 | 5 | 2 | wing-backs bomb forward, midfield controls |
| **3-4-3** | 3 | 4 | 3 | wingers + wide midfielders |
| **3-4-2-1** | 3 | 4 + 2 | 1 | three CBs + two AMs |
| **5-3-2** | 5 | 3 | 2 | wing-backs push high, midfield covers |
| **5-4-1** | 5 | 4 | 1 | defensive, counter-attack |

**How to pick**:
- **Possession** → more midfielders (4-3-3 / 3-5-2)
- **Defensive** → more defenders + a holding mid (4-1-4-1 / 5-4-1)
- **Attacking** → more forwards + wingers (4-3-3 / 3-4-3)
- **By squad** → fixed formation, build around your headline players

> A formation is just a **slot layout**. The same formation can play very differently depending on which players you put in it.

---

## Tactical style (3 dimensions)

Each lineup has 3 style dimensions, **all default to "balanced"**:

| Dimension | Options | Meaning |
|---|---|---|
| **Tempo** | slow / balanced / fast | overall game pace (passing, movement) |
| **Pitch width** | narrow / balanced / wide | how wide the team spreads across the field (touchline vs middle) |
| **Defensive line** | low / mid / high | how high the back line plays (affects offside traps and counter-attack space) |

**How to pick**:
- **Fast + wide + high** → aggressive high press, fits a strong team overwhelming a weaker one
- **Slow + narrow + low** → sit back and counter, fits an underdog facing a stronger team
- **Balanced / balanced / mid** → neutral, use this when you don't have a specific plan

> These three dimensions apply to the **whole team on the pitch**. See [chapter 15: Match Tactics](15-tactics.md) for the on-pitch effects.

---

## Tactical events (in-match triggers)

**Tactical events = actions you schedule in advance, fired by a specific minute + condition during the match**. Two kinds:

### Substitution (sub on, sub off)

- **When** — which match minute (1-90)
- **Out** — a player currently on the pitch (or a sub already on)
- **In** — a bench player (or a starter who hasn't been on yet)
- **Condition** — one of the 6 trigger conditions (below)

### Move (shift a player to a different position)

- **When** — 1-90 minutes
- **Who** — a player currently on the pitch
- **To** — an empty slot in the same position family
- **Condition** — one of the 6 trigger conditions

> A move is **within the same position family** (e.g. a CM can shift to a DM slot). You can't move a midfielder to winger. GKs can't be moved.

### 6 trigger conditions

| Condition | When it fires |
|---|---|
| **always** | fires regardless of score |
| **leading** | only when your team is ahead |
| **trailing** | only when your team is behind |
| **tied** | only when the score is level |
| **notLeading** | when behind or tied (i.e. anything except leading) |
| **notTrailing** | when ahead or tied (i.e. anything except trailing) |

**Common patterns**:
- **Protect a lead** — minute 70 / always / swap an attacker for a defensive mid
- **Chase a deficit** — minute 60 / trailing / sub on a striker, off a defender
- **Half-time reshuffle** — minute 45 / always / move a winger to attacking mid (formation shift)

> Triggered subs / moves generate a **tactical event** in the match log (see [chapter 6](06-match-basics.md)).

---

## Tactical presets (save and reuse)

You might prepare different tactics for different opponents (home / away / strong foe / weakling). GoalXI lets you **save a whole setup as a preset** and apply it later.

**A preset contains**:
- Formation + starting XI + bench
- Tactical style (tempo / pitch width / defensive line)
- Tactical events (subs / moves list)

**Preset rules**:
- A team can have **multiple presets**, but only **one default preset**
- **Preset names must be unique** within the team
- **The default preset cannot be deleted** (set another preset as default first)
- When submitting tactics, you can **reference a preset ID** to pre-fill everything

**Typical usage**:
- "Home aggressive" / "Away defensive" / "Bus vs stronger"
- 5 minutes before kickoff → apply preset → submit

---

## Submit and lock

**Match lifecycle**:

```
scheduled → tactics_locked → in_progress → completed
```

- **scheduled** — you can submit / edit tactics
- **tactics_locked** — **no more edits**, match is about to start
- **in_progress** — match running, submit closed
- **completed** — match finished

**When does it lock**:
- **The UI auto-locks the editor 30 minutes before kickoff** (with a countdown)
- Kickoff = locked
- After lock, view-only

> **No submission after lock**. If tactics aren't submitted in time, the submit fails. Submit before lock.

---

## How to set a lineup (overview)

1. Open match detail → click "Set tactics"
2. **Pick a formation** — 11 position slots appear
3. **Drag players into slots** — 11 starters + up to 6 bench
4. **Set tactical style** — tempo / pitch width / defensive line
5. **Add tactical events** (optional) — sub / move + minute + condition
6. **Save as preset** (optional) — give it a name, optionally mark as default
7. **Submit tactics** — finish before the 30-minute lock window

> The editor **validates in real time**: missing GK, wrong player count, players not on your team, etc. all surface as errors before submit.

---

## Common mistakes

❌ **GK slot filled by a non-GK** — **only a goalkeeper takes GK** (pitch or bench GK); a GK can only go in GK
❌ **8 starters / 12 starters** — **must be 9-11**, fewer fails, more won't fit
❌ **Same player in two slots** — **no duplicates**, first drop wins
❌ **Using an opponent's / other team's player** — **not allowed**, only your squad counts
❌ **Two presets with the same name** — **unique names per team**, rename before saving
❌ **Deleting the default preset** — **can't**, set another preset as default first
❌ **Editing after lock** — **UI locks 30 min before kickoff**, plan ahead
❌ **Empty bench** — **submits fine**, but you have 0 subs available. Strongly recommend at least 1-2 bench players
❌ **Sub minute = 0 / 95** — **1-90 only**, anything outside fails
❌ **Moving the GK** — **GKs don't move**, GK slots don't participate in moves
❌ **Cross-family moves** — **same family only** (CM → DM is fine, CM → W is not)

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Skills** (chapter 2) | headline skills decide how a player performs in their slotted position |
| **Positions** (chapter 3) | the 11 slots map to the 9 position families (see chapter 3) |
| **Other attributes** (chapter 4) | form / experience / stamina affect the per-event performance each match |
| **Match basics** (chapter 6) | triggered tactical events appear in the match event log |
| **Tactics** (chapter 15) | how tactical style affects on-pitch performance and tactical events |
| **Subs / team orders** (chapter 16) | manual in-match subs and team orders |
| **Youth** (chapter 19) | youth squads have an independent lineup system (currently not in use) |

---

## Next

- [chapter 2: Player Skills](02-player-skills.md) — the 10 outfield / 9 GK skills and how they grow
- [chapter 3: Player Positions](03-positions.md) — 9 position families + headline skills
- [chapter 6: Match Basics](06-match-basics.md) — how tactical events fire in a match
- [chapter 15: Match Tactics](15-tactics.md) — how tactical style affects player performance
- [chapter 16: Subs and Team Orders](16-subs-and-orders.md) — manual in-match subs
