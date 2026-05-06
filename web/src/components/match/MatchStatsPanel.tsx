'use client';

import type { MatchStatsRes } from '@/lib/api';

interface MatchStatsPanelProps {
  stats: MatchStatsRes;
  homeTeamName: string;
  awayTeamName: string;
}

interface StatBarProps {
  label: string;
  homeValue: number;
  awayValue: number;
  isPercentage?: boolean;
  isXG?: boolean;
  homeColor?: string;
  awayColor?: string;
}

function StatBar({
  label,
  homeValue,
  awayValue,
  isPercentage = false,
  isXG = false,
  homeColor = 'from-primary to-primary/70',
  awayColor = 'from-secondary to-secondary/70',
}: StatBarProps) {
  const total = homeValue + awayValue;
  const homePercent = total === 0 ? 50 : (homeValue / total) * 100;

  const display = (v: number) =>
    isPercentage ? `${v}%` : isXG ? v.toFixed(2) : v;

  return (
    <div className="mb-4">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className={`font-black text-base ${isXG ? 'text-primary' : 'text-on-surface'}`}>
          {display(homeValue)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
          {label}
        </span>
        <span className={`font-black text-base ${isXG ? 'text-secondary' : 'text-on-surface'}`}>
          {display(awayValue)}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-container">
        <div
          className={`bg-gradient-to-r ${homeColor} rounded-l-full transition-all duration-500`}
          style={{ width: `${homePercent}%` }}
        />
        <div
          className={`bg-gradient-to-l ${awayColor} rounded-r-full transition-all duration-500`}
          style={{ width: `${100 - homePercent}%` }}
        />
      </div>
    </div>
  );
}

export function MatchStatsPanel({ stats, homeTeamName, awayTeamName }: MatchStatsPanelProps) {
  const home = stats.homeComputed;
  const away = stats.awayComputed;
  const homeRaw = stats.homeTeamStats;
  const awayRaw = stats.awayTeamStats;

  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary">equalizer</span>
          Match Statistics
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant font-headline">
          90&apos;
        </span>
      </div>

      <div className="px-4 py-4">
        {/* xG Highlight */}
        <div className="mb-4 p-3 rounded-lg bg-surface-container border border-surface-container-high">
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <div className="text-2xl font-black font-headline text-primary drop-shadow-[0_0_8px_rgba(0,228,121,0.4)]">
                {home.xG.toFixed(2)}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-primary/70 mt-0.5">xG</div>
            </div>
            <div className="flex flex-col items-center gap-1 px-3">
              <div className="text-[8px] font-bold uppercase tracking-widest text-on-surface-variant">Expected Goals</div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <div className="w-1.5 h-1.5 rounded-full bg-secondary" />
              </div>
            </div>
            <div className="text-center flex-1">
              <div className="text-2xl font-black font-headline text-secondary drop-shadow-[0_0_8px_rgba(255,219,157,0.4)]">
                {away.xG.toFixed(2)}
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-secondary/70 mt-0.5">xG</div>
            </div>
          </div>
        </div>

        {/* Stat Bars */}
        <StatBar
          label="Possession"
          homeValue={homeRaw?.possession ?? 50}
          awayValue={awayRaw?.possession ?? 50}
          isPercentage
        />
        <StatBar
          label="Shots"
          homeValue={homeRaw?.shots ?? 0}
          awayValue={awayRaw?.shots ?? 0}
        />
        <StatBar
          label="On Target"
          homeValue={homeRaw?.shotsOnTarget ?? 0}
          awayValue={awayRaw?.shotsOnTarget ?? 0}
        />
        <StatBar
          label="Corners"
          homeValue={homeRaw?.corners ?? 0}
          awayValue={awayRaw?.corners ?? 0}
        />
        <StatBar
          label="Fouls"
          homeValue={homeRaw?.fouls ?? 0}
          awayValue={awayRaw?.fouls ?? 0}
          homeColor="from-yellow-500 to-yellow-400"
          awayColor="from-yellow-600 to-yellow-500"
        />
        <StatBar
          label="Offsides"
          homeValue={homeRaw?.offsides ?? 0}
          awayValue={awayRaw?.offsides ?? 0}
        />
        <StatBar
          label="Yellow Cards"
          homeValue={homeRaw?.yellowCards ?? 0}
          awayValue={awayRaw?.yellowCards ?? 0}
          homeColor="from-yellow-500 to-yellow-400"
          awayColor="from-yellow-600 to-yellow-500"
        />
        <StatBar
          label="Red Cards"
          homeValue={homeRaw?.redCards ?? 0}
          awayValue={awayRaw?.redCards ?? 0}
          homeColor="from-red-500 to-red-400"
          awayColor="from-red-600 to-red-500"
        />
        <StatBar
          label="Pass Accuracy"
          homeValue={home.passAccuracy}
          awayValue={away.passAccuracy}
          isPercentage
        />
        <StatBar
          label="Tackles"
          homeValue={home.tackles}
          awayValue={away.tackles}
          homeColor="from-cyan-500 to-cyan-400"
          awayColor="from-cyan-600 to-cyan-500"
        />
        <StatBar
          label="Interceptions"
          homeValue={home.interceptions}
          awayValue={away.interceptions}
          homeColor="from-blue-500 to-blue-400"
          awayColor="from-blue-600 to-blue-500"
        />

        {/* Team Labels */}
        <div className="flex justify-between mt-4 pt-3 border-t border-surface-container-high">
          <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70 font-headline">
            {homeTeamName}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-secondary/70 font-headline">
            {awayTeamName}
          </span>
        </div>
      </div>
    </div>
  );
}
