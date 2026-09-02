---
order: 6
slug: match-basics
title: Match Basics
status: full
lastUpdated: 2026-08-30
relatedChapters: [5, 14, 15, 16, 18]
relatedEntries: [player-event-types, condition-form-injury, pwi-vs-overall, comparing-two-players]
---

# Match Basics

Matches are the core of GoalXI. Every league game, cup tie, playoff, and friendly follows the same flow: pre-match info, in-match event stream, match clock, and post-match report.

This chapter covers **what you can see during a match**. For setting a lineup, see [chapter 5](05-lineup-basics.md). For tactical style, see [chapter 15](15-tactics.md). For manual subs, see [chapter 16](16-subs-and-orders.md).

---

## Match status (lifecycle)

Every match moves through a status:

```
scheduled → tactics_locked → in_progress → completed
```

| Status | Meaning | What you can do |
|---|---|---|
| **scheduled** | match generated, not yet kicked off | submit / edit tactics |
| **tactics_locked** | close to kickoff, no more edits | wait for kickoff |
| **in_progress** | match is running | watch the live view |
| **completed** | match is done | read the report, check attribute changes |

In rare cases a match can also be **cancelled** (e.g. one side forfeits and the fixture is withdrawn).

---

## Pre-match info (on the match page)

Open a match and you'll see these **pre-match details**:

- **Kickoff time** — when the match starts
- **Venue** — home / away (home is your own ground)
- **Weather** — sunny / cloudy / rainy / windy / foggy / snowy; affects the match (rain and snow make the ball slippery, passes float more)
- **Attendance** — number of fans in the ground
- **Home / away** — who plays at home (left) and who plays away (right)
- **Both formations** — auto-derived from each side's starting XI (see [chapter 5](05-lineup-basics.md))
- **Both lineups + bench** — 11 + 6 + 6
- **Match type** — league / cup / tournament / friendly / national team / playoff

> Around 5 minutes before kickoff, the page shows a **"both teams line up"** announcement and the live view starts.

---

## What you can see during a match

The live view has four core panels:

### Live score

- Home vs away score in the top corners
- Updates instantly on goals
- Frozen at the final whistle

### Match clock

**The clock advances as the match progresses**, just like real football:

- **First half**: minute 1 to 45 (45 real minutes)
- **First-half injury time**: **+N minutes** (N is determined during the match, usually 1-5+)
- **Half-time**: **15 minutes** (clock freezes on the injury-time minute)
- **Second half**: minute 46 to 90 (clock restarts at 46 after the break)
- **Second-half injury time**: **+N minutes**
- **Extra time** (when the match needs a winner): minute 91 to 120
- **Break between extra-time halves**: another 5 minutes
- **Penalty shootout** (still tied after ET): shown on the match page

**How to read it**:
- The live page top shows the current minute (e.g. `45+2'`, `67'`, `90+5'`)
- Injury time is shown as `+N`
- Once the clock reaches the end of 90 (or ET), the match moves to "completed"

### Live commentary (text broadcast)

Every key event triggers **a commentary line that updates immediately**:

- Who did what (goal / save / foul / ...)
- How (header / 1v1 / long shot / free kick / ...)
- Where (left / centre / right)
- Who assisted, who defended
- Whether it scored / was saved / missed

**Examples**:
- "GOAL! {player} puts {team} ahead!"
- "{player} dribbles down the left, beats the defender, and {quality} finish low into the net!"
- "Brilliant save! {keeper} tips {player}'s header over the bar!"
- "Half-time whistle! {team} leads {score}."

### Timeline (key events)

The timeline is a **chronological list of key events**, from kickoff to full time, all on one screen:

- Per event: time + player + short description
- Goals / subs / cards / injuries are colour-coded
- Offsides, fouls, and corners usually **don't** show in the timeline (too frequent)

---

## Event types during a match

Events on the pitch are grouped into a few player-facing categories:

### Shot events (high frequency)

| Event | Meaning |
|---|---|
| **Goal** | a normal goal |
| **Penalty goal** | a 12-yard penalty converted |
| **Own goal** | scored into your own net |
| **Save** | the keeper stopped the shot (no goal) |
| **Missed shot** | off-target / blocked / cleared (no goal) |
| **Penalty miss** | 12-yard penalty not converted (off-target or saved) |

**Shot type** shown: header / 1v1 / long shot / rebound / normal.

**Shot area**: left / centre / right.

### Cards (foul punishment)

| Event | Meaning |
|---|---|
| **Yellow card** | a warning (2 yellows in the same match = red) |
| **Second yellow → red** | the same player's 2nd yellow of the match; sent off |
| **Red card (direct)** | a serious foul; sent off directly |

A sent-off player **can't continue**, and the team plays with one fewer.

### Substitutions

- **Tactical subs** you pre-scheduled in the lineup editor (see [chapter 5](05-lineup-basics.md)) fire at their set minute
- **Injury subs** happen automatically (the system judges minor = can continue, severe = must sub)
- The timeline shows: who came off, who came on

### Injuries

- Triggered during the match: bad tackle, overuse, etc.
- Two states: **minor** (can keep playing, ability reduced) / **severe** (forced sub, see [chapter 4](04-player-attributes.md))

### Set pieces

| Event | Meaning |
|---|---|
| **Corner** | ball deflected off a defender over the goal line; attacking side restarts from the corner flag |
| **Free kick** | foul called; dead-ball restart |
| **Direct free kick** | can shoot directly from the foul spot |

> Set pieces themselves **usually don't appear in the timeline** (too frequent), but a direct free kick that goes in shows as a regular Goal.

### Offsides

- Offsides fire during the match, but **don't always show in the timeline** (the FE usually skips them)
- Important matches have a dedicated offside stat in the post-match report

### Match phases

- **Half-time** — first half ends (at 45+N1), 15-minute break
- **Full time** — 90+N2 minutes, regulation ends
- **Extra-time halves** — 91-105 / 106-120
- **Penalty shootout** — ET tied, kicks from 12 yards to decide

### Meta events (kickoff information)

Before kickoff, a few **informational events** appear on the page (not in the timeline):

- **Lineup announcement** — "Both teams line up! {home} {count} vs {away} {count} players"
- **Weather announcement** — "{today's weather}"
- **Attendance** — "Attendance: {N}"

---

## Match pace (overview)

| Phase | Length | Clock range |
|---|---|---|
| First half | 45 minutes | 1' - 45' |
| First-half injury time | 1-5+ minutes | 45+1' - 45+N' |
| Half-time | 15 minutes | clock freezes on 45+N |
| Second half | 45 minutes | 46' - 90' |
| Second-half injury time | 1-5+ minutes | 90+1' - 90+N' |
| Extra-time first half (if needed) | 15 minutes | 91' - 105' |
| Extra-time second half (if needed) | 15 minutes | 106' - 120' |
| Penalty shootout (if needed) | 5 each, then 1 by 1 | after the match |

**Regular league / cup matches**: full 90 minutes, a draw just ends the match (split the points / per the rules)
**Matches needing a winner** (cup / playoff): draw goes to extra time, then penalties if still tied

---

## Fog of war (information asymmetry)

**The two teams see slightly different information during the match**:
- **Your side's events**: shown in real time (goals, saves, fouls, subs)
- **The other side's events**: may be delayed before they show up on your screen, or partially hidden — especially details from the far half
- **Stats** (possession, shot count, etc.): both sides can see them after the match
- **A completed match**: all information is open, you can read the full event log

> This asymmetry is to capture the "home fan watching the home broadcast" feel. **Don't rely on it for tactical decisions** — the match has already run with your lineup + tactical preset, the live view is a read-only broadcast.

---

## Forfeit

**If one side can't field a team** (very rare): the system awards the other side a default win.

- Score: **3-0 walkover**, the winner gets 3 points (in league standings)
- The timeline shows a **"{team} forfeits the match"** note
- The forfeiting side **gets no experience or skill growth** from this match

---

## Match types (6 kinds)

| Type | Meaning | Notes |
|---|---|---|
| **League** | regular points competition, home and away | win 3 / draw 1 / lose 0 |
| **Cup** | single elimination, draw goes to ET / penalties | winner advances, loser is out |
| **Tournament** | short-format multi-team competition | per tournament rules |
| **Friendly** | practice match, no standings impact | **no player-facing flow right now** |
| **National team** | players represent their national team | highest EXP multiplier (5x) |
| **Playoff** | promotion / relegation tie | per match rules |

> Per-match-type EXP multipliers are in [chapter 4](04-player-attributes.md).

---

## After the match

When the match moves to "completed":

- **Score freezes**, the timeline stops
- **Match report**: stats by lane (left / centre / right attack share, xG, possession, etc.)
- **Player attribute changes**:
  - **Skills**: +1 per skill based on in-match contribution (within the potential range, see [chapter 2](02-player-skills.md))
  - **Experience**: gains per match duration × match-type multiplier (see [chapter 4](04-player-attributes.md))
  - **Form**: rises on good performances, drops on bad ones
  - **Injury record**: major injuries leave a record
- **League table update** (win +3 / draw +1 / lose +0)
- **Next fixture**: visible on the schedule

---

## Common mistakes (about watching a match)

❌ **"Why can't I see the opponent's events?"** — fog of war by design, you only see your own side's details in real time
❌ **"The clock isn't moving"** — half-time is 15 minutes and the clock freezes; not a bug
❌ **"Why is it still playing at 90 minutes?"** — injury time; wait for the ref's whistle
❌ **"Where are the offsides?"** — too frequent, they don't go in the timeline; only in stats
❌ **"How does a forfeit count?"** — 3-0 walkover, winner gets 3 points; the forfeiting side gets no EXP
❌ **"When does extra time start?"** — only in matches that need a winner, not in regular league
❌ **"How are penalties scored?"** — only after ET is still tied; the shootout goals don't count for player stats (only the match result)
❌ **"Why did a player get subbed if not injured?"** — could be a tactical sub you set in the lineup editor (see [chapter 5](05-lineup-basics.md)), not an injury

---

## Relationship to other concepts

| Concept | Relationship |
|---|---|
| **Lineup** (chapter 5) | the lineup you submit decides who plays |
| **Other attributes** (chapter 4) | form / experience / stamina multiply every in-match event |
| **Tactics** (chapter 15) | tactical style + tactical events take effect during the match |
| **Subs and orders** (chapter 16) | in-match manual subs / team orders (if any) |
| **Transfers** (chapter 18) | player performance affects market value (see chapter 18) |
| **Set pieces and special events** (chapter 14) | 14 event types and their triggers |

---

## Next

- [chapter 5: Lineup Basics](05-lineup-basics.md) — how to set starting XI + bench + presets
- [chapter 14: Set Pieces and Special Events](14-set-pieces.md) — the 14 event types
- [chapter 15: Match Tactics](15-tactics.md) — tactical style + tactical events in action
- [chapter 16: Subs and Team Orders](16-subs-and-orders.md) — in-match manual controls
- [chapter 4: Player Other Attributes](04-player-attributes.md) — what each attribute does in a match
