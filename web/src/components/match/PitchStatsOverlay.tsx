/**
 * PitchStatsOverlay.tsx — the "阵容评级" read, drawn where it happens.
 *
 * Previously this was a 3×3 table (ATK / POS / DEF × LEFT / CENTRE /
 * RIGHT) that compared each team's *same* phase in the *same* lane, with
 * row and column captions. Two problems with that: it reads like a
 * spreadsheet, and the pairs it compares never meet on the grass — the
 * home left winger is marked by the away *right* back, not the away left
 * winger.
 *
 * So the table is gone and the numbers sit on a pitch instead:
 *
 *   ┌──────────────┬──────────────┬──────────────┐
 *   │  home def    │  home pos    │  home atk    │   ← top band =
 *   │  vs away atk │  vs away pos │  vs away def │     home's left
 *   ├──────────────┼──────────────┼──────────────┤
 *   │            … centre band …                 │
 *   ├──────────────┼──────────────┼──────────────┤
 *   │            … bottom band …                 │
 *   └──────────────┴──────────────┴──────────────┘
 *
 * No "进攻 / 控球 / 防守" row headers and no "左 / 中 / 右" column headers:
 * the column is which third of the pitch the duel happens in, the row is
 * which band, and that is enough. `pitch-duels.ts` owns the mirroring.
 *
 * The zones are flush — hairlines only, no cards — so the pitch markings
 * underneath (halfway line, centre circle, boxes) tie the numbers to the
 * grass instead of leaving nine boxes floating in space. Each zone tints
 * green→cream at the share boundary, so the colour split is the bar.
 */

"use client";

import { useTranslations } from "next-intl";
import type { MatchSnapshot } from "./match-pitch-data";
import { buildDuels, type DuelZone } from "./pitch-duels";

interface PitchStatsOverlayProps {
  snapshot: MatchSnapshot;
  /** Used in the cell tooltips and nothing else — no captions on the map. */
  homeTeamName?: string;
  awayTeamName?: string;
}

export function PitchStatsOverlay({
  snapshot,
  homeTeamName,
  awayTeamName,
}: PitchStatsOverlayProps) {
  const t = useTranslations("matches.live");
  const zones = buildDuels(snapshot);

  return (
    <div className="absolute inset-0 p-2 sm:p-3" data-testid="pitch-stats-grid">
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-[#07170f]">
        <PitchMarkings />
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
          {zones.map((zone, index) => (
            <DuelCell
              key={`${zone.column}-${zone.row}`}
              zone={zone}
              index={index}
              homeTeamName={homeTeamName ?? t("home")}
              awayTeamName={awayTeamName ?? t("away")}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PitchMarkings — hairline geometry so the grid reads as a pitch, not a table
// ============================================================================

function PitchMarkings() {
  return (
    <div aria-hidden className="absolute inset-0">
      {/* Halfway line + centre circle + spot */}
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.09]" />
      <div className="absolute left-1/2 top-1/2 h-[30%] w-[19%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.09]" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
      {/* Penalty and goal areas, one set per end */}
      <div className="absolute left-0 top-1/2 h-[60%] w-[16%] -translate-y-1/2 border border-l-0 border-white/[0.09]" />
      <div className="absolute right-0 top-1/2 h-[60%] w-[16%] -translate-y-1/2 border border-r-0 border-white/[0.09]" />
      <div className="absolute left-0 top-1/2 h-[28%] w-[6%] -translate-y-1/2 border border-l-0 border-white/[0.09]" />
      <div className="absolute right-0 top-1/2 h-[28%] w-[6%] -translate-y-1/2 border border-r-0 border-white/[0.09]" />
    </div>
  );
}

// ============================================================================
// DuelCell — one zone: the two ratings as a single pair, share tint behind
// ============================================================================

/** Hairlines on the right/bottom edges only, so the map reads as one surface. */
const EDGE_CLASS = [
  "border-r border-b",
  "border-r border-b",
  "border-b",
  "border-r border-b",
  "border-r border-b",
  "border-b",
  "border-r",
  "border-r",
  "",
];

function DuelCell({
  zone,
  index,
  homeTeamName,
  awayTeamName,
}: {
  zone: DuelZone;
  index: number;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const tZone = useTranslations("matches.zone");
  const homePct = Math.round(zone.homeShare * 100);
  const awayPct = 100 - homePct;
  const phaseLabel: Record<DuelZone["homePhase"], "atk" | "poss" | "def"> = {
    atk: "atk",
    pos: "poss",
    def: "def",
  };

  return (
    <div
      className={`relative flex items-center justify-center border-white/[0.07] ${EDGE_CLASS[index]}`}
      data-testid={`duel-${zone.column}-${zone.row}`}
      title={`${homeTeamName} ${tZone(phaseLabel[zone.homePhase])} ${zone.home.toFixed(1)} · ${awayTeamName} ${tZone(phaseLabel[zone.awayPhase])} ${zone.away.toFixed(1)}`}
    >
      {/* The tint boundary is the share. Light enough that the pitch lines
          stay visible through it — the position on the grass is the point. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 12%, transparent) ${homePct}%, color-mix(in srgb, var(--color-secondary) 9%, transparent) ${homePct}%)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-2 w-px bg-white/[0.14]"
        style={{ left: `${homePct}%` }}
      />
      <span className="relative flex items-center gap-2.5 sm:gap-4">
        <span className="flex flex-col items-end">
          <span className="font-headline text-xl leading-none font-black tabular-nums text-primary sm:text-2xl">
            {zone.home.toFixed(1)}
          </span>
          <span className="mt-1 text-kicker leading-none font-medium tabular-nums text-primary/70">
            {homePct}%
          </span>
        </span>
        <span aria-hidden className="h-7 w-px bg-white/15" />
        <span className="flex flex-col items-start">
          <span className="font-headline text-xl leading-none font-black tabular-nums text-secondary sm:text-2xl">
            {zone.away.toFixed(1)}
          </span>
          <span className="mt-1 text-kicker leading-none font-medium tabular-nums text-secondary/70">
            {awayPct}%
          </span>
        </span>
      </span>
    </div>
  );
}
