---
order: 2
slug: names
title: Appendix 2: Names
status: full
lastUpdated: 2026-09-02
relatedChapters: [1]
relatedEntries: []
---

# Appendix 2: Names

GoalXI has **3 categories of names**: players / teams / stadiums. **Each has different generation rules**. This chapter covers where each name comes from and whether you can change it.

---

## 1. Three categories at a glance

| Name type | How it comes | Can you change it? | Notes |
|---|---|---|---|
| **Player** | Name pool + nationality random pick | **No** | 14 nationality pools, fixed at creation |
| **Team** | **Self-supplied at registration** (or default `New Club`) | **Yes** (`PATCH /teams/me`) | Every change writes an audit log |
| **Stadium** | System-generated (the literal `Stadium`) | **Yes** (`POST /teams/:id/stadium/rename`) | Every change writes an audit log |

> The 3 categories are **independent**. You **can't** rename a player, only a team / stadium.

---

## 2. Player name (auto-generated, you can't change it)

### Name pools (14 nationalities)

`libs/database/src/constants/name-database.ts` provides **14 nationality** first + last name pools:

| Code | Nationality | Style |
|---|---|---|
| `GB` | England / Great Britain | English |
| `ES` | Spain | Spanish |
| `BR` | Brazil | Portuguese |
| `IT` | Italy | Italian |
| `FR` | France | French |
| `DE` | Germany | German |
| `NL` | Netherlands | Dutch |
| `AR` | Argentina | Spanish |
| `PT` | Portugal | Portuguese |
| `US` | United States | English |
| **`CN`** | **China (default)** | **Chinese** |
| `JP` | Japan | Japanese |
| `KR` | South Korea | Korean |
| `MX` | Mexico | Spanish |

> Default team nationality = `CN`, so **most NPC players have Chinese names**.

### Name format

**`{firstName} {lastName}`** — 2 tokens, space-separated. Each nationality has its own `firstNames` / `lastNames` arrays (~20-30 firsts + 30+ lasts per pool).

### Player nationality = team nationality (70% probability)

When a player is generated:
- **70% chance** → player nationality = team nationality (CN team → CN player, Chinese name)
- **30% chance** → player nationality = random one of 14 pools (CN team → could be BR / IT / GB etc.)

> **Practical**:
> - A CN team has a **majority of Chinese names**
> - A **few** "foreigners" (non-CN nationalities) per team
> - The CN default **favors Chinese names** but isn't 100% (some variety)

### Unknown nationality → fallback `GB`

If a player's nationality field is not in the 14 pools (e.g. `XX`-style dirty data):
- **fallback** = `GB` pool (English)
- **No error** — silent fallback
- Players **see no difference** (just an English-looking name)

### When names are generated

Player names are generated **once at creation**, then **never change**:
- Initial squad (16 players per team)
- Scout candidates
- Substitutes / youth (system-generated)

> **Important**: **a player name is permanent**. A `Zhang San` stays `Zhang San`, doesn't become `John` after a transfer or promotion.

### You can't change a player name

**There's no "rename player" API in the MVP**. The name is part of the identity (also written in `player_event` records); renaming would break the readability of historical events.

> **Future**: Hattrick has a "rename player" feature (5 GC). GoalXI may add it post-MVP.

---

## 3. Team name (self-supplied at registration, changeable)

### At registration

At team registration (`POST /teams/claim` or `POST /teams`):
- `name` field (2-50 chars)
- Blank → default `New Club`

```
New Club
```

### Rename the team

`PATCH /teams/me` with `{ name: "new name" }`:
- Effective immediately
- Writes an audit log entry (`name_change` type)
- Standings / cup bracket / transfer list show the new name right away
- **No limit** on rename count (every change writes audit)

### What you **can't** change

Other team fields are **locked at registration**:
- `nationality` — set at registration, locked like `name`
- `city` — set at registration
- `foundedYear` — auto-stamped on creation
- `leagueId` — managed by promotion / relegation, players can't touch

> Team name / nationality / city are all part of the identity; changing them would **break historical record readability**.

---

## 4. Stadium name (system default, changeable)

### Default name

When the stadium is created, the system auto-names it the neutral `Stadium` (from `libs/database/src/constants/stadium.constants.ts`):

```
Stadium
```

> All NPC / BOT stadiums are called `Stadium` — there are **no** real-stadium names like "Camp Nou" / "Wembley".

### Rename the stadium

`POST /teams/:teamId/stadium/rename` with `{ name: "new name" }`:
- Effective immediately
- Writes an audit log entry (`stadium_rename` type)
- Appears on the team detail / match page (home venue)

> Stadium name is **purely cosmetic**, no mechanics impact (no sale / no ticket effect).

### How many times can you rename?

**MVP stage**: no limit (every change writes audit).

---

## 5. "Internationality" of names (cross-league / transfer)

### Cross-league player transfer

MVP **does not support cross-league transfers** (see [Chapter 18](18-transfer.md)). **If it ever does**:
- Player name **doesn't change** (whatever nationality they are, they stay)
- Team + stadium names also don't change (the player moves, not the team)

### Same-league transfer

- Player name **doesn't change**
- Team name **changes** (A → B)
- Stadium name **changes** (follows the player)

### Scout candidates' names

Scout candidates (`GET /scouts/candidates`) use the **same** `getRandomNameByNationality()` function — same source as your team players.

---

## 6. How to see a player's nationality

- Player detail page → player card → **Nationality** field
- Next to the radar chart, or below it
- Format: 2-letter ISO code (`CN` / `BR` / `GB` etc.)

> The scout system also uses the 14 nationality pools — **identical** to your team's pool.

---

## 7. Name validation (for `PATCH /teams/me` etc.)

| Field | Length | Characters |
|---|---|---|
| `name` (team) | 2-50 chars | any |
| `stadium name` | 1-50 chars | any |
| player firstName / lastName | no limit (you can't change) | fixed at birth |

> **Characters** aren't restricted today (`@StringFieldOptional({ minLength, maxLength })`) — technically you can use emoji / Chinese / Arabic. **Spaces** are allowed ("Beijing FC").

---

## 8. Bot / NPC names

### Team names (1360 NPC teams)

- All **Chinese** (because `DEFAULT_TEAM_NATIONALITY = 'CN'`)
- e.g. `北京 FC` / `上海联` / `广州竞技` etc.
- Generated by `team-onboarding-generator` at pyramid bootstrap
- Players can **reference this style** when naming their own team

### Stadium names (1360 NPC stadiums)

- All `Stadium` (neutral default)
- Players **can** name their own stadium (Chinese / English / anything)
- Future NPC stadiums may get random names too (Hattrick-style, every team gets a unique stadium)

### Player names (1360 × 16 = 21,760 NPC players + scout candidates)

- Mostly CN (70%), minority 13 other nationalities
- 2 tokens: first + last
- **Same** pool as the player's team

---

## 9. Can / can't (about names)

### ✅ Can

- Name your team at registration (`POST /teams/claim`)
- **Rename the team** (`PATCH /teams/me`)
- **Rename the stadium** (`POST /teams/:teamId/stadium/rename`)
- View a player's nationality (detail page)
- Use emoji / multi-language in names

### ❌ Can't (MVP)

- **Rename a player** — no API, maybe future
- **Rename a scout's player** — same
- **Change team nationality** — locked at registration
- **Change team city** — locked at registration
- **Change team founding year** — auto-stamped
- **Change team league** — promotion / relegation only
- **Change NPC team / stadium / player names** — all system-generated

### ❌ MVP limits

- **No "name validation"** (slurs filter / duplicate check) — in theory you can rename your team to clash with someone else
- **No "rename player"** paid / charged mechanic (like Hattrick 5 GC)
- **No "auto-taboo"** special rules
- **No "random Chinese name"** using pinyin (uses a real Chinese name pool directly)

---

## 10. Common mistakes (about names)

❌ **"Player name is random"**: **not fully random**, **70% follows the team nationality**, only 30% is truly random
❌ **"CN team = 100% CN players"**: **no**, 70% CN + 30% other 13 nationalities
❌ **"I can rename a player"**: **no** (MVP)
❌ **"I can change team nationality"**: **no** (locked at registration)
❌ **"I can name my stadium 'Camp Nou'"**: **yes** (`POST /teams/:id/stadium/rename`)
❌ **"Team name clash fails"**: **no** — duplicate names are allowed
❌ **"Renaming the team wipes the points"**: **no** — name is display layer, no data impact
❌ **"NPC players have unique names"**: **most do** (`getRandomNameByNationality()`), but stadiums are all `Stadium`
❌ **"Players rename after a transfer"**: **no** — name is permanently bound
❌ **"Bot teams = real famous club names"**: **no** — all CN (`北京 FC` style), no real-club simulation

---

## 11. Practical flow (naming tips)

### At registration

- **2-50 chars** — not too long, not too short
- **Any language** — Chinese / English / emoji
- **Suggestion**: Chinese name + "FC" / "联" / "竞技" / "体育" suffix
  - e.g. `北京蓝鹰 FC` / `上海 1992 联` / `广州群星`
- **Avoid**:
  - Clashing with existing NPC team names (allowed but ugly)
  - Leaving blank (system uses `New Club`, ugly)
  - Too long (50 char cap, layout breaks)

### Renaming the stadium

- Match the team name style (team = `北京蓝鹰`, stadium = `蓝鹰体育场`)
- Uniqueness not enforced
- Audit log on every change (not shown to players yet)

### Reading player nationality

- Player detail page → Nationality field
- **Used to judge player background**:
  - CN player = domestic academy
  - 13 other nationalities = "foreign"
  - Foreigners don't add wage or special bonus (MVP stage)

---

## 12. How this connects to other concepts

| Concept | Connection |
|---|---|
| **Team registration** (Chapter 1) | Team name + nationality locked at claim |
| **Player attributes** (Chapter 4) | Player name is identity, no attribute impact |
| **Transfer** (Chapter 18) | Transfer **doesn't rename**, just changes `teamId` |
| **Specialty / potential / PWI** (Chapter 4) | **completely unrelated** to name |
| **Scout** (Chapter 19) | Scout candidates use the **same** 14 nationality pools |
| **Stadium** (Chapter 11) | Stadium name is **purely cosmetic**, no construction / ticket effect |

---

## Next

- [Chapter 1: Game Intro](01-game-intro.md) — how to name at registration
- [Chapter 4: Player Other Attributes](04-player-attributes.md) — player name is identity
- [Chapter 11: Stadium](11-stadium.md) — stadium naming
- [Chapter 18: Transfer Market](18-transfer.md) — transfer doesn't rename a player
- [Chapter 19: Youth Players](19-youth-and-scouts.md) — scout candidate names
