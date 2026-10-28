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
 * The share is the headline (it is what "who wins this zone" means), the
 * raw ratings are the footnote. Zones are flush over the whole surface —
 * no padding, no cards — so the mown stripes, halfway line, centre circle
 * and boxes read as one pitch. Each zone tints green→cream at the share
 * boundary, so the colour split is the bar.
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
    <div className="absolute inset-0" data-testid="pitch-stats-grid">
      <div className="relative h-full w-full overflow-hidden bg-[#0a2016]">
        <PitchSurface />
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
// PitchSurface — mown stripes + hairline geometry, so the grid reads as grass
// ============================================================================

function PitchSurface() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {/* Halfway line + centre circle + spot */}
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.16]" />
      <div className="absolute left-1/2 top-1/2 h-[34%] w-[21%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.14]" />
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30" />
      {/* Penalty and goal areas, one set per end */}
      <div className="absolute left-0 top-1/2 h-[62%] w-[16%] -translate-y-1/2 border border-l-0 border-white/[0.13]" />
      <div className="absolute right-0 top-1/2 h-[62%] w-[16%] -translate-y-1/2 border border-r-0 border-white/[0.13]" />
      <div className="absolute left-0 top-1/2 h-[30%] w-[6%] -translate-y-1/2 border border-l-0 border-white/[0.13]" />
      <div className="absolute right-0 top-1/2 h-[30%] w-[6%] -translate-y-1/2 border border-r-0 border-white/[0.13]" />
    </div>
  );
}

// ============================================================================
// DuelCell — one zone: share as the headline, ratings as the footnote
// ============================================================================

/** Hairlines between zones, never on the outer edge of the map. */
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
      className={`relative flex flex-col items-center justify-center border-white/[0.08] ${EDGE_CLASS[index]}`}
      data-testid={`duel-${zone.column}-${zone.row}`}
      title={`${homeTeamName} ${tZone(phaseLabel[zone.homePhase])} ${zone.home.toFixed(1)} · ${awayTeamName} ${tZone(phaseLabel[zone.awayPhase])} ${zone.away.toFixed(1)}`}
    >
      {/* A soft wash toward whoever owns the zone — uniform, not split, so
          the nine zones don't stack into coloured stripes and the grass and
          the pitch lines stay readable. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, ${
            homePct >= awayPct ? "var(--color-primary)" : "var(--color-secondary)"
          } 6%, transparent)`,
        }}
      />
      <div className="relative z-20 flex h-full w-full flex-col items-center justify-center px-2">
        <span className="flex items-baseline gap-3 font-headline leading-none font-black tabular-nums sm:gap-4">
          <span className="text-2xl text-primary sm:text-3xl">{homePct}%</span>
          <span className="text-2xl text-secondary sm:text-3xl">{awayPct}%</span>
        </span>
        <span className="mt-1 flex items-baseline gap-3 text-label leading-none font-medium tabular-nums text-on-surface-variant/70 sm:gap-4">
          <span>{zone.home.toFixed(1)}</span>
          <span>{zone.away.toFixed(1)}</span>
        </span>
        {/* The split lives in the bar, not in the cell fill. */}
        <span
          aria-hidden
          className="mt-2 flex h-1 w-[72%] overflow-hidden rounded-full bg-white/10"
        >
          <span className="h-full bg-primary/90" style={{ width: `${homePct}%` }} />
          <span className="h-full bg-secondary/70" style={{ width: `${awayPct}%` }} />
        </span>
      </div>
    </div>
  );
}
