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
 * So the table is gone and the numbers sit in the shape of the pitch:
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
 * raw ratings are the footnote, and each zone tints green→cream at the
 * share boundary so the colour split *is* the bar.
 *
 * The map is inset in its panel rather than bleeding to the edges, and it
 * carries no pitch markings: nine solid panes are the whole picture. Drawn
 * over a halfway line and centre circle they read as colour bleeding
 * through a diagram instead of a clean territory map.
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
    <div
      className="absolute inset-0 flex items-center justify-center bg-[#07130c] p-3 sm:p-4"
      data-testid="pitch-stats-grid"
    >
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]">
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1 p-1">
          {zones.map((zone) => (
            <DuelCell
              key={`${zone.column}-${zone.row}`}
              zone={zone}
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
      className="relative flex overflow-hidden rounded-md shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
      data-testid={`duel-${zone.column}-${zone.row}`}
      title={`${homeTeamName} ${tZone(phaseLabel[zone.homePhase])} ${zone.home.toFixed(1)} · ${awayTeamName} ${tZone(phaseLabel[zone.awayPhase])} ${zone.away.toFixed(1)}`}
    >
      {/* Two solid panes that meet at the share — borrowed from Hattrick's
          zone map. Inside a zone there is no border and no gap: the colour
          edge *is* the boundary. The zones themselves are separate tiles, so
          each staircase step stays inside its own tile instead of running
          down the whole map. */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, var(--color-primary) 34%, #07130c)`,
          clipPath: `inset(0 ${awayPct}% 0 0)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `color-mix(in srgb, var(--color-secondary) 46%, #171006)`,
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
