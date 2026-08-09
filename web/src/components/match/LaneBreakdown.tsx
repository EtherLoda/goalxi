/**
 * LaneBreakdown — visual home/away strength comparison across pitch lanes.
 *
 * Each lane (Left Wing / Center / Right Wing) is rendered as a card
 * with three metric rows (ATK / DEF / POSS). Every metric uses a
 * back-to-back bar: home bar grows left-to-right from the home value,
 * away bar grows right-to-left from the away value, both meeting in
 * the middle. The longer bar = the stronger team for that metric —
 * no math required to read the comparison.
 *
 * Each lane card also carries a small "← Home" / "Away →" badge that
 * totals the three metrics, so the user can tell at a glance which
 * side dominated the lane. A footer with overall possession and shots
 * ties the lane picture back to the headline match stats.
 */
'use client';

import React from 'react';
import { clsx } from 'clsx';

export interface LaneStrength {
  attack: number;
  defense: number;
  possession: number;
}

export interface LaneBreakdownProps {
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
  homePossessionPct?: number;
  awayPossessionPct?: number;
  homeShots?: number;
  awayShots?: number;
}

const HOME_FALLBACK = '#00e479';
const AWAY_FALLBACK = '#ffdb9d';

const LANES = [
  { key: 'left' as const, label: 'Left Wing', sub: 'L', icon: 'south_west' },
  { key: 'center' as const, label: 'Center', sub: 'C', icon: 'swap_vert' },
  { key: 'right' as const, label: 'Right Wing', sub: 'R', icon: 'south_east' },
];

const METRICS = [
  { key: 'attack' as const, label: 'Attack', short: 'ATK' },
  { key: 'defense' as const, label: 'Defense', short: 'DEF' },
  { key: 'possession' as const, label: 'Possession', short: 'POS' },
];

export function LaneBreakdown({
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
}: LaneBreakdownProps) {
  return (
    <div className="glass-panel rounded-2xl p-4 shrink-0">
      {/* Header */}
      <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
        <span className="material-symbols-outlined text-base">analytics</span>
        Lane Breakdown
      </h3>

      {/* Team header strip — color swatches + names on each side */}
      <div className="flex items-center justify-between mb-3 text-[10px] font-headline">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/10"
            style={{ backgroundColor: homeColor }}
          />
          <span className="font-bold uppercase tracking-wider truncate" style={{ color: homeColor }}>
            {homeTeamName}
          </span>
        </div>
        <span className="text-[9px] font-label text-on-surface-variant/40 px-1">VS</span>
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
          const winner: 'home' | 'away' | 'draw' =
            homeTotal > awayTotal ? 'home' : homeTotal < awayTotal ? 'away' : 'draw';

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
                    {lane.label}
                  </span>
                  <span className="font-mono text-[9px] text-on-surface-variant/50">· {lane.sub}</span>
                </div>
                {winner !== 'draw' && (
                  <span
                    className={clsx(
                      'text-[8px] font-headline font-black uppercase tracking-widest px-1.5 py-0.5 rounded',
                      winner === 'home'
                        ? 'bg-primary/20 text-primary'
                        : 'bg-secondary/20 text-secondary',
                    )}
                  >
                    {winner === 'home' ? '← HOME' : 'AWAY →'}
                  </span>
                )}
              </div>

              {/* Metric rows */}
              <div className="px-2.5 py-2 space-y-1.5">
                {METRICS.map((metric) => {
                  const homeVal = Math.round(home[metric.key]);
                  const awayVal = Math.round(away[metric.key]);
                  // Use the max of the two so the longer bar fills
                  // its half. (50% of the total width caps either side
                  // so they always meet in the middle.)
                  const peak = Math.max(homeVal, awayVal, 1);
                  const homePct = (homeVal / peak) * 50;
                  const awayPct = (awayVal / peak) * 50;

                  return (
                    <div
                      key={metric.key}
                      className="grid grid-cols-[28px_1fr_1fr] items-center gap-1.5 text-[9px]"
                    >
                      <span className="font-headline font-bold text-[8px] uppercase tracking-widest text-on-surface-variant/70 text-center">
                        {metric.short}
                      </span>

                      {/* Home: value + bar (left → right) */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className="font-mono font-black tabular-nums text-[10px] w-7 text-right shrink-0"
                          style={{ color: homeColor }}
                        >
                          {homeVal}
                        </span>
                        <div className="flex-1 h-1.5 bg-surface-container-high/40 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${homePct}%`,
                              backgroundColor: homeColor,
                              opacity: 0.9,
                            }}
                          />
                        </div>
                      </div>

                      {/* Away: bar (right → left) + value */}
                      <div className="flex items-center gap-1 min-w-0">
                        <div className="flex-1 h-1.5 bg-surface-container-high/40 rounded-full overflow-hidden flex justify-end">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${awayPct}%`,
                              backgroundColor: awayColor,
                              opacity: 0.9,
                            }}
                          />
                        </div>
                        <span
                          className="font-mono font-black tabular-nums text-[10px] w-7 text-left shrink-0"
                          style={{ color: awayColor }}
                        >
                          {awayVal}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — overall match summary */}
      {(homePossessionPct !== undefined || homeShots !== undefined) && (
        <div className="mt-3 pt-2.5 border-t border-on-surface/10 flex items-center justify-between text-[9px] font-label uppercase tracking-widest">
          {homePossessionPct !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 font-bold">Poss</span>
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
              <span className="text-on-surface-variant/60 font-bold">%</span>
            </div>
          )}
          {homeShots !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-on-surface-variant/60 font-bold">Shots</span>
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
