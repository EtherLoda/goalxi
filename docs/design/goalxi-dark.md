# Design System: goalxi\_dark — Unified Specification

> **This file is hand-maintained.** It started as an export of the Stitch design tool and used to live in the (git-ignored) `stitch_design/` tree, which made it unreviewable and one re-export away from being overwritten. It now lives here because it is a contract, not an artefact.
>
> **Precedence:** `web/src/app/globals.css` is the implementation; this document is the intent. When they disagree, the CSS is what ships — so treat a mismatch as a bug in *this file* and fix it in the same PR. Tokens are only real once they are in the `@theme` block.
>
> Named families, icon names and radii below are checked against the code, not copied from the original export.

## 1. Overview & Creative North Star

**"The Tactical Architect"** — A premium data-war-room aesthetic. High-density information layouts with intentional asymmetry, tonal depth, and a Glass-on-Dark architecture.

***

## 2. Color Tokens (Surface System)

> Surface tokens describe hierarchy, NOT lightness. `surface-container-lowest` (#02110d) is the darkest surface.

| Token                       | Hex       | Usage                                 |
| --------------------------- | --------- | ------------------------------------- |
| `surface`                   | `#051612` | Page base background                  |
| `surface-container`         | `#11231e` | Section containers                    |
| `surface-container-low`     | `#0d1f1a` | Sidebar background                    |
| `surface-container-high`    | `#1c2d29` | Table headers, elevated sections      |
| `surface-container-highest` | `#273833` | Interactive cards, inputs             |
| `surface-container-lowest`  | `#02110d` | Floating panels, darkest elements     |
| `primary`                   | `#00e479` | CTAs, positive metrics, active states |
| `on-primary`                | `#003919` | Text on primary                       |
| `primary-container`         | `#002c12` | Primary tint                          |
| `secondary`                 | `#ffdb9d` | Elite status, premium indicators      |
| `tertiary`                  | `#e9c349` | Star players, world-class status      |
| `tertiary-container`        | `#cca830` | Role badge backgrounds                |
| `error`                     | `#ffb4ab` | Injuries, critical failures           |
| `on-surface`                | `#d3e7e0` | Primary text                          |
| `on-surface-variant`        | `#c1c8c4` | Secondary text                        |
| `surface-bright`            | `#2b3d38` | Hover states                          |
| `outline`                   | `#8b928f` | Full-opacity borders                  |
| `outline-variant`           | `#414845` | Ghost borders (15% opacity)           |

### Where Colors Actually Live

There is **no `tailwind.config`** — this project is Tailwind v4, which is CSS-first. Every token in the table above is a custom property inside the `@theme` block of `web/src/app/globals.css`, and Tailwind turns each one into a utility (`--color-primary` → `bg-primary` / `text-primary` / `border-primary`). Adding a color means adding a line there, not editing a JS config. *Never use `emerald-*` or any other stock palette class.*

### Supporting Families

The surface system above is the base. Four more families carry the product's semantics and are used just as heavily:

| Family       | Tokens                                                                                                                                                                                                                            | Usage                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `signal-*`   | `amber` `#f59e0b` · `gold` `#fbbf24` · `yellow` `#facc15` · `lime` `#abf853` (`-dim` `#3e6a00`) · `cyan` `#22d3ee` · `blue` `#60a5fa` (`-deep` `#0066ff`) · `violet` `#a78bfa` · `lilac` `#c084fc` · `pink` `#ec4899` · `magenta` `#f472b6` | Discipline / event / rating semantics — the loudest accents |
| `ink-*`      | `1000` `#00110c` → `500` `#003328` (plus 900, 850, 800, 750, 700, 600)                                                                                                                                                              | Neutral dark ramp for legacy surfaces; prefer surface tokens |
| `positive-*` | `-mid` `#059669` · `-soft` `#6ee7b7` · base `#10b981` · `-bright` `#34d399`                                                                                                                                                          | Stamina, condition, form, high-overall highlights          |
| `pitch-*`    | `-dark` `#022c22` · `-deep` `#064e3b` · `-mid` `#065f46` · `-line` `#047857` · `-mark` `#6ee7b7`                                                                                                                                      | The tactics-pitch surface and its markings                   |

A small set of older semantic aliases is still the most-used thing in the codebase: `accent` `#a1ffc2` (`-hover` `#8ee6b8`, `-soft` `#b9ffce`), `muted` `#91b2a6`, `frost` `#d3f5e8`, `jade` `#00ff9c`, `edge` `#2f4e44`, `faint` `#4a7a6a`, `danger` `#ef4444` (`-soft` `#ff716c`, `-surface` `#2a1515`), `float` `#1a1a2e`. **When a family token and an alias both fit, use the family** (`positive`, `signal-*`, `danger`) — the aliases are legacy.

### The "No-Line" Rule

**No 1px solid borders for sectioning.** Use background shifts. Only use `border border-white/5` for subtle card edges.

### The "Glass & Gradient" Rule

Glass panels: `backdrop-blur-xl bg-surface-container-low/75 border border-white/5`.
Primary CTA gradient: `bg-gradient-to-br from-primary to-on-primary-container`.

***

## 3. Typography

| Role     | Font          | Class            | Size     | Weight  | Usage                             |
| -------- | ------------- | ---------------- | -------- | ------- | --------------------------------- |
| Display  | Space Grotesk | `.font-headline` | 3.5rem   | Black   | Match scores                      |
| Headline | Space Grotesk | `.font-headline` | 1.25rem  | Bold    | Section titles, player names, nav |
| Body     | Inter         | `.font-body`     | 0.875rem | Regular | Descriptions, table data          |
| Label    | Inter         | `.font-label`    | 0.75rem  | Bold    | Badges, metadata                  |

**Never use pure white.** Use `text-on-surface` (#d3e7e0) for primary, `text-on-surface-variant` (#c1c8c4) for secondary.

Both families are self-hosted through `next/font` in `app/layout.tsx`; the `--font-space-grotesk` / `--font-inter` variables it injects feed the `--font-*` tokens, so **never name a family in a component**. Only the `latin` subset is downloaded — CJK glyphs (the whole zh UI) always resolve through `system-ui`, which is why no font file covers them.

***

## 4. Spacing Scale

These are **Tailwind's default spacing utilities**, not custom tokens — `globals.css` sets no `--spacing` override, so `p-4` resolves through Tailwind's built-in `--spacing: 0.25rem` base. Don't go looking for `--spacing-4` in the CSS, and don't add one.

| Utility | rem     | Usage in this codebase                |
| ------- | ------- | ------------------------------------- |
| `p-1`   | 0.25rem | Tight gaps                            |
| `p-2`   | 0.5rem  | Default gaps, icon padding            |
| `p-3`   | 0.75rem | Section padding                       |
| `p-4`   | 1rem    | Card padding — the workhorse          |
| `p-5`   | 1.25rem | Standard padding                      |
| `p-6`   | 1.5rem  | Section gaps, spacious cards          |
| `p-8`   | 2rem    | Large gaps                            |

**Erratum.** The original export listed `spacing-4` as `0.9rem`. Every `p-4` in the app has always rendered at Tailwind's default 1rem; the 0.9rem figure described nothing that existed.

***

## 5. Shadow Tokens

| Token             | Value                         | Usage              |
| ----------------- | ----------------------------- | ------------------ |
| `shadow-card`     | `0 4px 16px rgba(0,0,0,0.3)`  | Cards              |
| `shadow-glass`    | `0 8px 32px rgba(0,0,0,0.37)` | Glass panels       |
| `shadow-floating` | `0 12px 32px rgba(0,0,0,0.4)` | Tooltips, popovers |

***

## 6. Components

### Sidebar

```html
<aside class="bg-surface-container-low border-r border-white/5">
  <!-- Active item: `fill` is Material's FILL 1 axis -->
  <a class="bg-primary text-on-primary rounded-lg mx-1 px-3">
    <AppIcon name="home" fill class="text-lg" />
    <span class="font-headline text-xs font-bold">Squad</span>
  </a>
  <!-- Inactive item -->
  <a class="text-on-surface-variant hover:text-on-surface hover:bg-white/5">
    <AppIcon name="groups" class="text-lg" />
    <span class="font-headline text-xs font-medium">Squad</span>
  </a>
</aside>
```

### Top AppBar

```html
<header class="bg-surface/70 backdrop-blur-2xl border-b border-white/5 h-16">
  <span class="font-headline font-black text-xs uppercase tracking-[0.2em] text-primary">SQUAD MANAGEMENT</span>
</header>
```

### Primary Button

```html
<button class="bg-primary text-on-primary font-headline font-black text-xs uppercase tracking-widest px-4 py-2 rounded-lg hover:opacity-90 transition-all">
```

### Ghost Button

```html
<button class="bg-white/5 border border-white/10 text-[10px] font-headline font-black uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-all">
```

### Card Container

```html
<div class="bg-surface-container-low border border-white/5 rounded-2xl overflow-hidden shadow-card">
```

### Fitness Ring (SVG Circular Progress)

```html
<svg class="transform -rotate-90">
  <circle class="text-surface-container-highest" stroke-width="3" r="16" />
  <circle class="text-primary" stroke-width="3" stroke-dasharray="100" stroke-dashoffset="5" stroke-linecap="round" />
</svg>
```

### Morale Indicator — **SVG ONLY, NO EMOJI**

* Excellent: `<AppIcon name="sentiment_very_satisfied" className="text-lg text-primary" />`

* Neutral: `<AppIcon name="sentiment_neutral" className="text-lg text-on-surface-variant" />`

* Poor: `<AppIcon name="sentiment_dissatisfied" className="text-lg text-error" />`

### Role Tags

* Natural: `<span class="bg-tertiary-container/10 text-tertiary border border-tertiary/20 text-[10px] font-black px-2 py-0.5">AM(C)</span>`

* Other: `<span class="bg-surface-variant text-on-surface-variant border border-white/10 text-[10px] font-black px-2 py-0.5">DM</span>`

### FAB

```html
<button class="fixed bottom-8 right-8 w-14 h-14 bg-primary text-on-primary rounded-2xl shadow-[0_8px_32px_rgba(0,228,121,0.3)] flex items-center justify-center hover:scale-110 active:scale-95 transition-all z-50">
  <AppIcon name="person_add" className="text-3xl" />
</button>
```

### Player Table

```html
<thead>
  <tr class="bg-surface-container-high/30 text-[10px] font-headline uppercase tracking-widest text-on-surface-variant border-b border-white/5">
</thead>
<tbody>
  <tr class="hover:bg-primary/5 cursor-pointer border-b border-white/5 transition-all group">
</tbody>
<!-- Expanded row -->
<tr class="bg-black/20 border-l-4 border-primary">
```

### Squad Stats Card

```html
<div class="bg-surface-container-low border border-white/5 rounded-2xl p-6 h-32 relative overflow-hidden group">
  <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
  <span class="text-[10px] font-headline font-black uppercase tracking-widest text-primary">Squad Avg</span>
  <span class="text-4xl font-headline font-black text-white tracking-tighter">7.42</span>
</div>
```

***

## 7. Icons

The Material Symbols icon font is **retired**. Every icon is an inline stroke SVG rendered by one component.

```tsx
import { AppIcon } from "@/components/icons/AppIcon";

<AppIcon name="stadium" />                    // inherits text-* sizing
<AppIcon name="favorite" className="text-lg text-primary" />
<AppIcon name="close" label="Close" />        // icon-only control: label it
```

**Rules**

1. **One entry point.** Never import from `lucide-react` in a component — `<AppIcon>` owns the mapping and the sizing contract. The only exception is `icons/custom-icons.tsx`, which draws the glyphs lucide lacks (stadium, ball, basketball, referee cards).
2. **Names stay Material ligatures.** `name` keys are the original `material-symbols-outlined` names (`stadium`, `sell`, `sentiment_neutral`). A name that isn't in `ICON_MAP` fails to compile and renders a `CircleDashed` placeholder with a dev warning — fix it by adding the entry, never by working around it.
3. **Size with type, not pixels.** `size` defaults to `1em`, so `text-sm` / `text-lg` size the icon exactly as it sized the old ligature span. Hardcode a size only for fixed-slot icons (timeline markers, pitch markers).
4. **Decorative unless labelled.** `AppIcon` is `aria-hidden` by default. An icon that is a control's *only* content must pass `label` — or the button/link needs its own `aria-label`.
5. **`fill` is the FILL axis.** `<AppIcon name="home" fill={isActive} />` reproduces Material's `FILL 1` for active nav states.
6. **No emoji, for status or decoration.** Referee cards, balls and weather are SVGs (`YellowCardIcon`, `BallIcon`, `cloud`/`rainy`/`ac_unit` names). A glyph that renders differently per OS is a bug report waiting to happen.
7. **Animation is whitelisted.** Only `<AnimatedIcon slot="…" active={…} />` may morph, and only for slots declared in `icons/AnimatedIcon.tsx` — one control, two states, same idea drawn differently. Loading states are `animate-spin`, not morphs.

***

## 8. Motion & Feedback

Motion here is punctuation, not decoration: it points at the thing that just changed and then gets out of the way.

### The Timing Ladder

Every transition picks a **step**, not a number. The steps live in `globals.css` as `@utility` aliases, and the durations they encode are: `duration-instant` 100ms · `duration-quick` 150ms · `duration-base` 200ms · `duration-slow` 300ms · `duration-deliberate` 500ms. Tailwind's numeric `duration-*` utilities still compile, but a bare number in a component is a review comment.

| Step          | Value  | Use for                                                             |
| ------------- | ------ | ------------------------------------------------------------------- |
| `instant`     | 100ms  | a state flips on something already on screen (toggle, chip, check) |
| `quick`       | 150ms  | hover and press feedback: color, opacity, ring                     |
| `base`        | 200ms  | cards, dropdowns, disclosure, tabs, tooltips entering              |
| `slow`        | 300ms  | larger surfaces moving: sheets, drawers, modals, expanding groups  |
| `deliberate`  | 500ms  | continuous physical motion: progress fills, stamina bars, tracking  |

A `transition-*` class **with no duration is `quick`** — that is Tailwind's 150ms default and it happens to be a step, so the ~190 plain `transition-colors` call sites are already on the ladder and need no edit.

### Curves

Four easings, declared as `--ease-*` in `@theme`:

| Token            | Value                     | Use for                                                        |
| ---------------- | ------------------------- | -------------------------------------------------------------- |
| `standard`       | `cubic-bezier(0.2, 0, 0, 1)` | **The default for everything.** A decelerating curve, because UI that stops should arrive settled rather than coast |
| `entrance`       | `cubic-bezier(0.05, 0.7, 0.1, 1)` | elements appearing — tooltips, hover-revealed labels, expanding groups |
| `exit`           | `cubic-bezier(0.4, 0, 1, 1)` | elements leaving, so the disappearance is not noticed            |
| `spring`         | `cubic-bezier(0.34, 1.56, 0.64, 1)` | overshoot; continuous motion that carries momentum — **never** on a value that updates every tick**,** or it wobbles forever |

`standard` is applied as a default in `@layer base`, so the overwhelming majority of transitions need no easing class at all; `ease-*` is for the deliberate exceptions. Never reach for `spring` on something that re-animates on every update (the match-timeline fills move on each clock tick).

### Interaction Treatments

**Reduced motion is a hard requirement.** `globals.css` ends with a `prefers-reduced-motion: reduce` block that collapses every animation and transition globally, so perpetual loops (live pulse dots, spinners) freeze and hover states go instant. Never add motion that only that block can save you from — no JS-driven animation without a media-query guard, and no `animate-*` on anything load-bearing that has no `motion-safe:` guard.

| Interaction                    | Treatment                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| Hover on a control             | `transition-colors` / `transition-all` (implicit `quick`) plus a small scale (`hover:scale-110`, FABs) or ring (`hover:ring-4`, markers) |
| Press                          | `active:scale-95`                                                                            |
| Loading / fetching             | `animate-spin` on a spinner icon — **never** a morph                                         |
| Two-state toggle               | `<AnimatedIcon slot="…" active={…} />`, and only for a slot whitelisted in `AnimatedIcon.tsx` |
| Live data arriving             | `animate-pulse` on the indicator dot only, never on the value itself                          |
| Count-up numbers (wages, ELO)  | `useCountUp`, which reads `matchMedia` and jumps straight to the final value when reduced motion is on |

**Animation whitelist.** Morphing is opt-in per slot, and a slot only exists if one control has two states, the two states are the same idea drawn differently, and the animation carries meaning a static swap would lose (see §7 Icons, rule 7). `MorphIcon` is imported in exactly one file in the codebase; a second usage is a design review, not a refactor.

**Keyboard focus — known gap.** There is currently no `:focus-visible` rule in `globals.css`, so focus rings come from the browser default and disappear against the dark surfaces in a few places. Any interactive element must stay focusable and must not suppress its outline until a project-wide ring exists. Treat "add a visible focus ring" as an open task rather than a per-component decision.

***

## 9. Border Radius

* `sm`: 0.125rem — inline elements

* `lg`: 0.25rem — small buttons

* `xl`: 0.5rem — cards, inputs

* `2xl`: 0.75rem — modals, FABs

* `full`: 9999px — pills, avatars, FABs, circular icon buttons

  **Erratum.** The original export specified `0.75rem` for `full`, which
  cannot render a pill or a circle. `--radius-full` is `9999px` in
  `globals.css` and has been since.

***

## 10. Do's and Don'ts

### Do:

* Use Space Grotesk for all headings (`.font-headline`)

* Use Inter for body text (`.font-body`)

* Active nav = `bg-primary text-on-primary rounded-lg mx-1 px-3` + `<AppIcon fill />`

* Morale = `<AppIcon>` names, never emoji

* Glass panels = `bg-surface-container-low/75 backdrop-blur-xl border border-white/5`

### Don't:

* Don't use `emerald-*` classes — use surface tokens

* Don't use 100% opaque borders — use `border-white/5` or `outline-variant`

* Don't use emoji for status — use `<AppIcon>`

* Don't import from `lucide-react` in a component — go through `<AppIcon>`

* Don't name a font family in a component — use `.font-headline` / `.font-body` / `.font-label`

* Don't hot-link an external image — the CSP in `next.config.ts` allows `'self' data: blob:` only, so the browser silently drops it. Vendor the asset under `web/public/` and render it through `next/image`

* Don't mix active state styles — always `bg-primary rounded-lg`

* Don't use pure white text — use `text-on-surface`

