/**
 * ChanceDistribution — where each side's chances came from.
 *
 * The shape is lifted from Hattrick's "机会分布" panel: a two-tone bar
 * carrying both totals, then one row per lane with the home count on
 * the left and the away count on the right. The bar is the thing you
 * read at a glance ("who made more"), the rows are the breakdown.
 *
 * The rows are a *partition* of the bar — `chance-breakdown.ts`
 * guarantees every counted chance lands in exactly one bucket, so the
 * two totals equal the column sums. Don't add a row here without a
 * bucket there.
 *
 * Data comes from the event stream rather than a stats table: the
 * engine tags every shot with `data.lane` and every set piece with
 * `data.setPieceType`, neither of which the aggregated
 * `MatchTeamStatsEntity` exposes.
 */

"use client";

import { useTranslations } from "next-intl";
import { AppIcon } from "@/components/icons/AppIcon";
import {
  CHANCE_LANES,
  type ChanceBreakdown,
  type ChanceLane,
} from "./chance-breakdown";

export interface ChanceDistributionProps {
  breakdown: ChanceBreakdown;
  homeTeamName: string;
  awayTeamName: string;
}

const HOME_COLOR = "var(--color-primary)";
const AWAY_COLOR = "var(--color-secondary)";

export function ChanceDistribution({
  breakdown,
  homeTeamName,
  awayTeamName,
}: ChanceDistributionProps) {
  const t = useTranslations("matches.bento.chanceDistribution");
  const total = breakdown.home + breakdown.away;
  // A match with no chances yet still shows an honest 50/50 track, so the
  // card never collapses to a full-width bar of one colour.
  const homeShare = total === 0 ? 50 : (breakdown.home / total) * 100;
  const awayShare = 100 - homeShare;
  // Below ~18% the segment is too narrow for its own number; the row list
  // below carries the exact figure, so the badge steps out of the way.
  const homeFits = homeShare >= 18;
  const awayFits = awayShare >= 18;

  return (
    <div className="glass-panel rounded-2xl p-4 shrink-0">
      <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
        <AppIcon name="sports_soccer" className="text-base" />
        {t("title")}
      </h3>

      {/* Team strip — same swatch + name language as the stats card above. */}
      <div className="flex items-center justify-between mb-2 text-kicker font-headline">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: HOME_COLOR }}
          />
          <span
            className="font-bold uppercase tracking-wider truncate"
            style={{ color: HOME_COLOR }}
          >
            {homeTeamName}
          </span>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 justify-end">
          <span
            className="font-bold uppercase tracking-wider truncate"
            style={{ color: AWAY_COLOR }}
          >
            {awayTeamName}
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: AWAY_COLOR }}
          />
        </div>
      </div>

      {/* Two-tone bar: the totals live inside their own segments. */}
      <div
        className="flex h-7 overflow-hidden rounded-md bg-white/[0.06] text-kicker font-headline font-black tabular-nums text-ink-1000"
        data-testid="chance-bar"
      >
        {breakdown.home > 0 && (
          <span
            className="flex items-center justify-start pl-2"
            style={{ width: `${homeShare}%`, backgroundColor: HOME_COLOR }}
          >
            {homeFits ? breakdown.home : null}
          </span>
        )}
        {breakdown.away > 0 && (
          <span
            className="flex flex-1 items-center justify-end pr-2"
            style={{ backgroundColor: AWAY_COLOR }}
          >
            {awayFits ? breakdown.away : null}
          </span>
        )}
      </div>
      {total === 0 && (
        <p className="mt-1.5 text-kicker text-on-surface-variant/60">
          {t("empty")}
        </p>
      )}

      {/* Breakdown rows — home left, label centred, away right (Hattrick). */}
      <dl className="mt-2.5 space-y-0.5">
        {CHANCE_LANES.map((lane: ChanceLane) => {
          const row = breakdown.rows.find((r) => r.lane === lane);
          const home = row?.home ?? 0;
          const away = row?.away ?? 0;
          const dim = home === 0 && away === 0;
          return (
            <div
              key={lane}
              className="grid grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-1 text-label"
              data-testid={`chance-row-${lane}`}
            >
              <span
                className={`text-left tabular-nums ${dim ? "text-on-surface-variant/35" : "text-primary font-semibold"}`}
              >
                {home}
              </span>
              <span
                className={`text-center ${dim ? "text-on-surface-variant/45" : "text-on-surface-variant/85"}`}
              >
                {t(`lane.${lane}`)}
              </span>
              <span
                className={`text-right tabular-nums ${dim ? "text-on-surface-variant/35" : "text-secondary font-semibold"}`}
              >
                {away}
              </span>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
