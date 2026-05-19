'use client';

import type { MatchStatsRes } from '@/lib/api';

interface TacticalZonesPanelProps {
  stats: MatchStatsRes;
  homeTeamName: string;
  awayTeamName: string;
}

type Lane = 'left' | 'center' | 'right';

const LANE_LABELS: Record<Lane, string> = {
  left: 'LEFT',
  center: 'CENTER',
  right: 'RIGHT',
};

function sigmoidPct(home: number, away: number, k = 0.025): number {
  if (home === 0 && away === 0) return 50;
  return Math.round((1 / (1 + Math.exp(-(home - away) * k))) * 100);
}

function ZoneCell({
  label,
  homeValue,
  awayValue,
  homeColor = 'primary',
  awayColor = 'secondary',
}: {
  label: string;
  homeValue: number;
  awayValue: number;
  homeColor?: string;
  awayColor?: string;
}) {
  const homePct = sigmoidPct(homeValue, awayValue);

  const homeBar =
    homeColor === 'primary'
      ? 'bg-linear-to-r from-primary to-primary/70'
      : 'bg-linear-to-r from-amber-500 to-amber-400';
  const awayBar =
    awayColor === 'primary'
      ? 'bg-linear-to-l from-secondary to-secondary/70'
      : 'bg-linear-to-l from-amber-600 to-amber-500';

  return (
    <div className="bg-surface-container rounded-lg p-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 font-headline">
        {label}
      </div>
      <div className="flex justify-between text-sm font-black mb-2 font-headline">
        <span className="text-primary">{homeValue.toFixed(0)}</span>
        <span className="text-secondary">{awayValue.toFixed(0)}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden bg-surface-container-low flex">
        <div className={homeBar} style={{ width: `${homePct}%` }} />
        <div className={awayBar} style={{ width: `${100 - homePct}%` }} />
      </div>
    </div>
  );
}

export function TacticalZonesPanel({ stats, homeTeamName, awayTeamName }: TacticalZonesPanelProps) {
  const homeLanes = stats.homeTeamStats.laneStrengthAverages;
  const awayLanes = stats.awayTeamStats.laneStrengthAverages;

  if (!homeLanes || !awayLanes) {
    return (
      <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low px-4 py-5 text-center">
        <p className="text-on-surface-variant text-sm font-headline">Tactical data unavailable</p>
      </div>
    );
  }

  const lanes: Lane[] = ['left', 'center', 'right'];

  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary">radar</span>
          Tactical Zones
        </h3>
        <div className="flex gap-2 text-[9px] font-bold uppercase tracking-widest">
          <span className="text-primary font-headline">{homeTeamName}</span>
          <span className="text-on-surface-variant font-headline">vs</span>
          <span className="text-secondary font-headline">{awayTeamName}</span>
        </div>
      </div>

      <div className="px-4 py-3">
        {/* 3-Lane Grid */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {lanes.map((lane) => (
            <div key={lane} className="space-y-1.5">
              <div className="text-center text-[9px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
                {LANE_LABELS[lane]}
              </div>

              <ZoneCell
                label="Attack"
                homeValue={homeLanes[lane].attack}
                awayValue={awayLanes[lane].attack}
              />

              <ZoneCell
                label="Defense"
                homeValue={homeLanes[lane].defense}
                awayValue={awayLanes[lane].defense}
                homeColor="amber"
                awayColor="amber"
              />

              <ZoneCell
                label="Poss"
                homeValue={homeLanes[lane].possession}
                awayValue={awayLanes[lane].possession}
              />
            </div>
          ))}
        </div>

        {/* Dominance Summary */}
        <div className="flex justify-between items-center pt-2 border-t border-surface-container-high">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-primary/70 font-headline">
              {homeTeamName}
            </span>
          </div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
            Zone Control
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-secondary/70 font-headline">
              {awayTeamName}
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
          </div>
        </div>
      </div>
    </div>
  );
}
