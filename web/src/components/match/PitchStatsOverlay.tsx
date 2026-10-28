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
          {zones.map((zone) => (
            <DuelCell
              key={`${zone.column}-${zone.row}`}
              zone={zone}
              homeTeamName={homeTeamName ?? t("home")}
              awayTeamName={awayTeamName ?? t("away")}
            />
          ))}
        </div>
        {/* Depth: darken the corners so the map sits *in* a stadium rather
            than floating on a flat fill. Above the zones, below the text. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            background:
              "radial-gradient(120% 100% at 50% 50%, transparent 52%, rgba(0,0,0,0.5) 100%)",
          }}
        />
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
// DuelCell — one zone: two panes meeting at the share
// ============================================================================

function DuelCell({
  zone,
  homeTeamName,
  awayTeamName,
}: {
  zone: DuelZone;
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
      className="relative flex"
      data-testid={`duel-${zone.column}-${zone.row}`}
      title={`${homeTeamName} ${tZone(phaseLabel[zone.homePhase])} ${zone.home.toFixed(1)} · ${awayTeamName} ${tZone(phaseLabel[zone.awayPhase])} ${zone.away.toFixed(1)}`}
    >
      {/* Two solid panes that meet at the share — borrowed from Hattrick's
          zone map. No borders, no gaps: the colour edge *is* the boundary,
          so nine zones read as one painted pitch instead of a table. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, var(--color-primary) 36%, #0c2418)`,
          clipPath: `inset(0 ${awayPct}% 0 0)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, var(--color-secondary) 46%, #0c2418)`,
          clipPath: `inset(0 0 0 ${homePct}%)`,
        }}
      />
      <div className="relative z-20 flex w-full">
        {[
          { pct: homePct, rating: zone.home },
          { pct: awayPct, rating: zone.away },
        ].map((pane, i) => (
          // A pane narrower than a quarter of the cell can't hold the rating
          // footnote without clipping, so it drops to the percentage alone.
          <div
            key={i}
            className="flex flex-col items-center justify-center"
            style={{ width: `${pane.pct}%` }}
          >
            <span
              className={`font-headline leading-none font-black tabular-nums text-on-surface [text-shadow:0_1px_3px_rgba(0,0,0,0.35)] ${
                pane.pct < 26 ? 'text-base' : 'text-2xl sm:text-3xl'
              }`}
            >
              {pane.pct}%
            </span>
            {pane.pct >= 26 && (
              <span className="mt-1 text-label leading-none font-medium tabular-nums text-on-surface/55">
                ({pane.rating.toFixed(1)})
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
