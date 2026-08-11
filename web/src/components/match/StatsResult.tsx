/**
 * StatsResult — match-level strength comparison across pitch lanes.
 *
 * Renamed from `LaneBreakdown` to `StatsResult` because the panel is
 * now the canonical "after-the-fact" stats view (what the simulator
 * tells us each side managed to produce on average, per lane, per
 * phase). The bento grid (`PitchStatsOverlay`) is the live counterpart
 * showing the same numbers from the active snapshot.
 *
 * Each lane (Left Wing / Center / Right Wing) is rendered as a card
 * with three metric rows (ATK / DEF / POSS). The values are shown
 * side-by-side (home left, away right) — no progress bar, no width
 * comparison — so the panel reads as a flat score table rather than
 * a chart. The "← HOME" / "AWAY →" badge on each lane header still
 * tells the reader which side dominated at a glance.
 *
 * Engine raw values come in at ~100x the human-readable magnitude
 * (a single snapshot sums each player's phase strength across the
 * 11 starters; a 90-minute average lands in the 200-1800 range).
 * We divide by 100 here so the panel reads the same way as the live
 * `PitchStatsOverlay` (e.g. 880 → 8.8).
 *
 * All user-facing labels are i18n-ised under
 * `matches.bento.statsResult.*` (see `web/messages/{en,zh}.json`).
 * Adding a new locale = add the namespace; no component change.
 */

"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

export interface LaneStrength {
  attack: number;
  defense: number;
  possession: number;
}

export interface StatsResultProps {
  homeLaneStrength: {
    left: LaneStrength;
    center: LaneStrength;
    right: LaneStrength;
  };
  awayLaneStrength: {
    left: LaneStrength;
    center: LaneStrength;
    right: LaneStrength;
  };
  homeTeamName: string;
  awayTeamName: string;
  /** Hex strings; fall back to the theme primary/secondary if missing. */
  homeColor?: string;
  awayColor?: string;
  /** Optional overall match stats for the footer summary. */
  homePossessionPct?: string | number;
  awayPossessionPct?: string | number;
  homeShots?: number;
  awayShots?: number;
}

const HOME_FALLBACK = "#00e479";
const AWAY_FALLBACK = "#ffdb9d";

const LANES = [
  { key: "left" as const, i18nKey: "left", sub: "L", icon: "south_west" },
  { key: "center" as const, i18nKey: "center", sub: "C", icon: "swap_vert" },
  { key: "right" as const, i18nKey: "right", sub: "R", icon: "south_east" },
];

const METRICS = [
  { key: "attack" as const, i18nKey: "atk" },
  { key: "defense" as const, i18nKey: "def" },
  { key: "possession" as const, i18nKey: "poss" },
];

/**
 * Format an already-scaled lane strength (the engine now emits values
 * in the 0–10 display magnitude directly — see
 * `simulator/src/engine/match.engine.ts` `formatLanes` and
 * `getLaneStrengthAverages`). One decimal place — the second digit
 * never carries information and just adds visual noise.
 */
function formatStrength(raw: number): string {
  return raw.toFixed(1);
}

export function StatsResult({
  homeLaneStrength,
  awayLaneStrength,
  homeTeamName,
  awayTeamName,
  homeColor = HOME_FALLBACK,
  awayColor = AWAY_FALLBACK,
  homePossessionPct,
  awayPossessionPct,
  homeShots,
  awayShots,
}: StatsResultProps) {
  const t = useTranslations("matches.bento.statsResult");

  return (
    <div className="glass-panel rounded-2xl p-4 shrink-0">
      {/* Header */}
      <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base">analytics</span>
        {t("title")}
      </h3>

      {/* Team header strip — color swatches + names on each side */}
      <div className="flex items-center justify-between mb-3 text-[10px] font-headline">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: homeColor }}
          />
          <span
            className="font-bold uppercase tracking-wider truncate"
            style={{ color: homeColor }}
          >
            {homeTeamName}
          </span>
        </div>
        <span className="text-[9px] font-label text-on-surface-variant/40 px-1">
          {t("vs")}
        </span>
        <div className="flex items-center gap-1.5 min-w-0 justify-end">
          <span
            className="font-bold uppercase tracking-wider truncate"
            style={{ color: awayColor }}
          >
            {awayTeamName}
          </span>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: awayColor }}
          />
        </div>
      </div>

      {/* Lane cards */}
      <div className="space-y-2">
        {LANES.map((lane) => {
          const home = homeLaneStrength[lane.key];
          const away = awayLaneStrength[lane.key];
          const homeTotal = home.attack + home.defense + home.possession;
          const awayTotal = away.attack + away.defense + away.possession;
          const winner: "home" | "away" | "draw" =
            homeTotal > awayTotal
              ? "home"
              : homeTotal < awayTotal
                ? "away"
                : "draw";

          return (
            <div
              key={lane.key}
              className="rounded-lg border border-on-surface/5 bg-surface-container/30 overflow-hidden"
            >
              {/* Lane header */}
              <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container/50">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                    {lane.icon}
                  </span>
                  <span className="font-headline font-black text-[10px] uppercase tracking-wider text-on-surface">
                    {t(`lane.${lane.i18nKey}`)}
                  </span>
                  <span className="font-mono text-[9px] text-on-surface-variant/50">
                    · {lane.sub}
                  </span>
                </div>
                {winner !== "draw" && (
                  <span
                    className={clsx(
                      "text-[8px] font-headline font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                      winner === "home"
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary/20 text-secondary",
                    )}
                  >
                    {t(`winner.${winner}`)}
                  </span>
                )}
              </div>

              {/* Metric rows — values only, no bars. Four-column grid:
                  label (fixed width) | home value (right-aligned) |
                  dash separator | away value (left-aligned). The
                  explicit gaps + separator keep the two numbers from
                  running into each other when the values happen to be
                  close in magnitude (e.g. 5.4 vs 7.7). */}
              <div className="px-2.5 py-2 space-y-1.5">
                {METRICS.map((metric) => {
                  const homeVal = formatStrength(home[metric.key]);
                  const awayVal = formatStrength(away[metric.key]);
                  return (
                    <div
                      key={metric.key}
                      className="grid grid-cols-[36px_minmax(0,1fr)_12px_minmax(0,1fr)] items-center gap-2"
                    >
                      <span className="font-headline font-bold text-[9px] uppercase tracking-widest text-on-surface-variant/70">
                        {t(`metric.${metric.i18nKey}`)}
                      </span>
                      <span
                        className="font-headline font-black tabular-nums text-[12px] text-right"
                        style={{ color: homeColor }}
                      >
                        {homeVal}
                      </span>
                      <span className="text-on-surface-variant/30 text-[10px] text-center select-none">
                        –
                      </span>
                      <span
                        className="font-headline font-black tabular-nums text-[12px] text-left"
                        style={{ color: awayColor }}
                      >
                        {awayVal}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — overall match summary. Possession is sourced from
          `possessionPercentage` (0-100 string) — not the raw engine
          `possession` field, which is on a different scale. */}
      {(homePossessionPct !== undefined || homeShots !== undefined) && (
        <div className="mt-3 pt-2.5 border-t border-on-surface/10 flex items-center justify-between text-[9px] font-label uppercase tracking-widest">
          {homePossessionPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 font-bold">
                {t("footer.poss")}
              </span>
              <span
                className="font-headline font-black tabular-nums text-[11px]"
                style={{ color: homeColor }}
              >
                {homePossessionPct}
              </span>
              <span className="text-on-surface-variant/40">–</span>
              <span
                className="font-headline font-black tabular-nums text-[11px]"
                style={{ color: awayColor }}
              >
                {awayPossessionPct}
              </span>
              <span className="text-on-surface-variant/60 font-bold">
                {t("footer.percent")}
              </span>
            </div>
          )}
          {homeShots !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 font-bold">
                {t("footer.shots")}
              </span>
              <span
                className="font-headline font-black tabular-nums text-[11px]"
                style={{ color: homeColor }}
              >
                {homeShots}
              </span>
              <span className="text-on-surface-variant/40">–</span>
              <span
                className="font-headline font-black tabular-nums text-[11px]"
                style={{ color: awayColor }}
              >
                {awayShots}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
