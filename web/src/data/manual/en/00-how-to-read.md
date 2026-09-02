---
order: 0
slug: how-to-read
title: How to Read This Manual
status: full
lastUpdated: 2026-08-30
relatedChapters: []
relatedEntries: []
---

# How to Read This Manual

This manual is the **complete reference** for GoalXI players, covering every major system in the game. It complements the [in-app help assistant FAQ](../data/help/faq.en.json):

- **This manual** — long-form markdown, organized by chapter, for **systematic reading** and deep learning
- **In-app help assistant FAQ** — short Q&A entries, for **asking a specific question** quickly (intent + answer + followUp)

The two are linked: every chapter's `relatedEntries` field points to FAQ entries, and every FAQ's `followUp` array points to manual chapters. Reading the manual can jump to FAQ; asking the assistant can jump back to the manual.

## How to read

**New players** — read the first 5 chapters (1-5) for the core game loop, players, lineup, and matches. Then jump to whatever interests you.

**Veterans** — when `Related chapters:` hints at something, or browse `index.json` for a specific topic.

**Authors** — read the frontmatter reference + conventions below.

## Frontmatter fields

Every chapter markdown file starts with a YAML block wrapped in `---` that tells scripts / tools the file's metadata:

| Field | Required | Meaning | Example |
|---|---|---|---|
| `order` | yes | Chapter order in the manual (number) | `1` |
| `slug` | yes | Internal ID (English kebab-case), used for cross-references | `game-intro` |
| `title` | yes | Display title (zh or en per locale) | `游戏介绍` / `Game Introduction` |
| `status` | yes | Completeness | `full` / `partial` / `stub` / `not-applicable` |
| `lastUpdated` | yes | Last-updated date | `2026-08-30` |
| `relatedChapters` | - | Cross-chapter refs (array of orders) | `[2, 3, 4, 5, 14, 17, 18]` |
| `relatedEntries` | - | Cross-FAQ refs (array of FAQ entry ids) | `[pwi-vs-overall, ...]` |

**`status` values**:
- `full` — content complete, ready to ship
- `partial` — partial content, more to come
- `stub` — placeholder only, real content pending
- `not-applicable` — Hattrick chapter but GoalXI doesn't have this feature (with reason)

**`relatedChapters` / `relatedEntries`** are how documents cross-link. **A new chapter must populate both** — otherwise it becomes an "island".

## Writing conventions (locked)

These two rules apply to the whole manual. New chapters must follow, mirroring the two `CLAUDE.md` "Player-facing help" rules.

### 1. Never reveal engine internals (`noInternalNumbers`)

Do not write:
- Position weight numbers (e.g. `pace: 16, dribbling: 12`)
- PWI formula, GK save formula, EXP formula
- Upgrade-cost curve (sigmoid / linear / etc.)
- Injury coefficients, specialty multipliers
- Engine threshold constants (`PROMOTION_REVEAL_THRESHOLD` etc.)

You may write:
- Game mechanics observable by playing (EXP multiplier 5x, level 1-20, tactic deadline 10 min)
- Tier labels (`L0 None` → `L20 Beyond Compare`)
- Relative qualitative comparisons ("W headline is pace + dribbling")

### 2. Comparison / priority entries must cover all 10/9 skills (`noSilentOmission`)

For any entry touching skills (outfield 10 / GK 9), cover all of them:
- **Headline skills** (2-3) — explicit
- **Important skills** — explicit
- **Secondary skills** — explicit
- **Almost no impact skills** — also listed, in an "almost no impact" tier with a one-line reason

You must never **silently skip** a skill. A reader needs to know why "pace is critical for W but defending is irrelevant for W" — both facts must be in the answer.

## File structure

```
web/src/data/manual/
├── index.json              # chapter + appendix index (bilingual)
├── zh/
│   ├── 00-how-to-read.md   # this file (zh)
│   ├── 01-game-intro.md    # chapter 1
│   └── ...
└── en/
    ├── 00-how-to-read.md
    ├── 01-game-intro.md
    └── ...
```

- Chapter files: `{order:02d}-{slug}.md` (e.g. `01-game-intro.md`)
- Appendix files: `A{order}-{slug}.md` (e.g. `A1-weekly-cycle.md`)

## New-chapter checklist

1. Create `{NN}-{slug}.md` under `web/src/data/manual/{zh,en}/`
2. Fill the 7 frontmatter fields (especially `relatedChapters` / `relatedEntries`)
3. Write content following the two conventions above
4. **Mirror zh + en** (same structure, only content translated; the structural fields `slug` / `order` / `status` / `relatedChapters` / `relatedEntries` are NOT translated)
5. Update `index.json` (add the new chapter entry)
6. The `noInternalNumbers` + `noSilentOmission` rules from `CLAUDE.md` are inherited by the manual automatically

## Current coverage

See `index.json` for the full state. Current 26 chapters + 2 appendices:

- ✓ **full**: chapter 1 (more chapters incoming)
- △ **partial**: not in use yet
- ☐ **stub**: most of chapters 2-26 (planned, written one by one)
- ✗ **not-applicable**: chapters 12 / 16 / 21 / 22 / 24 / 25 (GoalXI doesn't have these)

## Relationship to the in-app help assistant FAQ

| Dimension | Manual (this) | FAQ |
|---|---|---|
| Format | long-form markdown, by chapter | short Q&A JSON, by intent |
| Use | systematic reading, deep learning | quick answer to one specific question |
| Entry | `/manual/zh/01-game-intro.md` | in-app assistant chat |
| Style | full explanation + examples + best practices | direct answer + jump links |
| Engine internals | not exposed | not exposed |
| Cross-link | `relatedEntries` → FAQ | `followUp` → manual chapter |

**They must stay consistent**: the same concept described in the manual and FAQ must read the same. If you change the manual, sync the FAQ entry; vice versa.

## Maintenance flow

1. **Game code changes** → check which chapters + which FAQ entries are affected
2. **Manual changes** → sync the corresponding FAQ entry, run cross-locale consistency check
3. **FAQ changes** → sync the corresponding manual chapter
4. **Commits** must land on `feat/game-manual` or `feat/help-kb-player`, never scattered on `main`
5. **Cross-locale mirror**: every chapter change must touch both zh and en, never one side only

## Questions

If you hit a corner case while writing (a Hattrick chapter GoalXI only partially has, a GoalXI-only feature Hattrick doesn't, etc.), check that chapter's `status` field and `notApplicableReason` (if set) in `index.json`, or read the "Player-facing help" rules in `CLAUDE.md`.

---

**Next**: [Ch 1: Game Introduction](01-game-intro.md) — what GoalXI is, how to play, how to win
