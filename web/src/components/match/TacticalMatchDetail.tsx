'use client';

import type { MatchEvent, MatchStatsRes, Match } from '@/lib/api';
import { formatEventCommentary } from '@/lib/commentary';

interface TacticalMatchDetailProps {
  match: {
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { name?: string; logoUrl?: string | null };
    awayTeam?: { name?: string; logoUrl?: string | null };
    status?: string;
    scheduledAt?: string | Date;
  };
  events: MatchEvent[];
  stats: MatchStatsRes;
  currentMinute?: number;
}

interface Goalscorer {
  playerName: string;
  minute: number;
  isHome: boolean;
  assistName?: string;
}

interface SnapshotPlayer {
  id: string;
  p: string; // position key
  n?: string; // name (only in full snapshot or for new players)
  st: number; // stamina
  sr: number; // star rating
  em: number; // entry minute (when sub came in)
}

interface SnapshotData {
  h: {
    n?: string;
    ls: { left: any; center: any; right: any };
    gk: number;
    ps: SnapshotPlayer[];
  };
  a: {
    n?: string;
    ls: { left: any; center: any; right: any };
    gk: number;
    ps: SnapshotPlayer[];
  };
}

/**
 * Extract the latest snapshot event from match events
 */
function getLatestSnapshot(events: MatchEvent[]): SnapshotData | null {
  const snapshots = events.filter(
    (e) => (e.typeName || e.type || '').toUpperCase() === 'SNAPSHOT'
  );
  if (snapshots.length === 0) return null;

  // Get the most recent snapshot (should be last one with highest minute)
  const latest = snapshots.reduce((prev, curr) => {
    const prevMinute = (prev as any).minute ?? 0;
    const currMinute = (curr as any).minute ?? 0;
    return currMinute > prevMinute ? curr : prev;
  });

  return (latest as any).data as SnapshotData;
}

/**
 * Map position key to CSS positioning for the pitch
 * Returns { top%, left% } for player dot placement
 */
function getPositionCoords(positionKey: string): { top: string; left: string } {
  const pos = positionKey.toUpperCase();

  // Goalkeeper
  if (pos === 'GK') {
    return { top: '85%', left: '50%' };
  }

  // Defenders
  if (pos === 'LB' || pos === 'LBL') return { top: '70%', left: '15%' };
  if (pos === 'CB' || pos === 'CDL') return { top: '70%', left: '32%' };
  if (pos === 'CD' || pos === 'CD') return { top: '70%', left: '50%' };
  if (pos === 'CDR' || pos === 'CB') return { top: '70%', left: '68%' };
  if (pos === 'RB' || pos === 'RBR') return { top: '70%', left: '85%' };
  if (pos === 'WBL') return { top: '70%', left: '10%' };
  if (pos === 'WBR') return { top: '70%', left: '90%' };

  // Midfielders
  if (pos === 'LM') return { top: '50%', left: '15%' };
  if (pos === 'LW') return { top: '50%', left: '15%' };
  if (pos === 'CM' || pos === 'CM') return { top: '50%', left: '35%' };
  if (pos === 'CMR') return { top: '50%', left: '50%' };
  if (pos === 'AM' || pos === 'AM') return { top: '50%', left: '65%' };
  if (pos === 'RM' || pos === 'RW') return { top: '50%', left: '85%' };
  if (pos === 'DM') return { top: '50%', left: '35%' };
  if (pos === 'DML') return { top: '50%', left: '25%' };
  if (pos === 'DMR') return { top: '50%', left: '75%' };

  // Forwards
  if (pos === 'ST' || pos === 'CF' || pos === 'CFL') return { top: '30%', left: '35%' };
  if (pos === 'STL' || pos === 'CF') return { top: '30%', left: '30%' };
  if (pos === 'STR' || pos === 'CFR') return { top: '30%', left: '70%' };
  if (pos === 'LW') return { top: '30%', left: '20%' };
  if (pos === 'RW') return { top: '30%', left: '80%' };

  // Fallback - center of pitch
  return { top: '50%', left: '50%' };
}

export function TacticalMatchDetail({
  match,
  events,
  stats,
  currentMinute = 90,
}: TacticalMatchDetailProps) {
  const homeName = match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.name || 'Away';
  const isLive = match.status === 'in_progress';

  // Extract snapshot for real player positions
  const snapshot = getLatestSnapshot(events);

  // Extract goalscorers
  const goalscorers: Goalscorer[] = events
    .filter((e) => {
      const type = (e.typeName || e.type || '').toUpperCase();
      return type === 'GOAL' || type === 'OWN_GOAL';
    })
    .map((e) => {
      const data = e.data as any;
      return {
        playerName:
          data?.playerName ||
          data?.scorer?.name ||
          e.data?.player?.name ||
          'Unknown',
        minute: e.minute,
        isHome: e.isHome ?? true,
        assistName: data?.assistName || data?.assister?.name || null,
      };
    })
    .sort((a, b) => a.minute - b.minute);

  const homeGoals = goalscorers.filter((g) => g.isHome);
  const awayGoals = goalscorers.filter((g) => !g.isHome);

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Floating Score Header */}
      <header className="glass-panel rounded-2xl px-6 py-3 flex items-center justify-between relative overflow-hidden flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

        {/* Home Team */}
        <div className="flex items-center gap-4 z-10 flex-1">
          <div className="text-right flex-grow">
            <div className="font-headline font-bold text-lg tracking-tight text-white uppercase">
              {homeName}
            </div>
            <div className="text-[9px] font-label uppercase tracking-widest text-primary/60">
              Home
            </div>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center relative z-10 border border-primary/20">
              <span className="text-primary font-black text-xs">{homeName.charAt(0)}</span>
            </div>
          </div>
        </div>

        {/* Central Score */}
        <div className="flex flex-col items-center z-10 px-6">
          <div className="flex items-center gap-4">
            <span className="text-5xl font-headline font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
              {match.homeScore ?? 0}
            </span>
            <div className="flex flex-col items-center gap-0.5">
              {isLive && (
                <div className="bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  <span className="text-primary font-headline font-bold text-[10px] tracking-widest animate-pulse">
                    {currentMinute}&apos;
                  </span>
                </div>
              )}
              {isLive && (
                <span className="text-[9px] font-label text-outline uppercase tracking-widest">
                  Live
                </span>
              )}
            </div>
            <span className="text-5xl font-headline font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
              {match.awayScore ?? 0}
            </span>
          </div>
        </div>

        {/* Away Team */}
        <div className="flex items-center gap-4 z-10 flex-1 justify-end">
          <div className="relative">
            <div className="absolute inset-0 bg-secondary/10 blur-xl rounded-full" />
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center relative z-10 border border-secondary/20">
              <span className="text-secondary font-black text-xs">{awayName.charAt(0)}</span>
            </div>
          </div>
          <div className="text-left flex-grow">
            <div className="font-headline font-bold text-lg tracking-tight text-white uppercase">
              {awayName}
            </div>
            <div className="text-[9px] font-label uppercase tracking-widest text-secondary/60">
              Away
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="flex-grow flex gap-4 min-h-0">
        {/* Left & Center: Pitch + Commentary */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">
          {/* 2D Tactical Pitch */}
          <div className="aspect-[16/9] bg-[#051a14] rounded-3xl relative border border-white/5 overflow-hidden">
            <div className="absolute inset-0 pitch-surface" />
            {/* Pitch Markings */}
            <div className="absolute inset-0 p-6">
              <div className="w-full h-full border border-primary/10 rounded flex items-center justify-center relative neon-line">
                {/* Center Line */}
                <div className="absolute h-full w-px bg-primary/10 left-1/2 -translate-x-1/2" />
                {/* Center Circle */}
                <div className="absolute w-32 h-32 border border-primary/10 rounded-full" />
                <div className="absolute w-1.5 h-1.5 bg-primary/30 rounded-full left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
                {/* Penalty Areas */}
                <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[60%] w-[16%] border border-primary/10 border-l-0" />
                <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[60%] w-[16%] border border-primary/10 border-r-0" />
              </div>
            </div>

            {/* Real Player Dots from Snapshot */}
            {snapshot ? (
              <>
                {/* Home Team Players (bottom half, defending) */}
                {snapshot.h.ps.map((player) => {
                  const coords = getPositionCoords(player.p);
                  const displayName = player.n
                    ? player.n.split(' ').pop() || player.n // Use last name
                    : player.p;
                  return (
                    <div
                      key={player.id}
                      className="absolute z-20"
                      style={{ top: coords.top, left: coords.left, transform: 'translate(-50%, -50%)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center"
                        title={player.n || player.p}
                      >
                        <span className="font-headline font-extrabold text-[10px] text-primary">
                          {displayName.substring(0, 3)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {/* Away Team Players (top half, attacking) */}
                {snapshot.a.ps.map((player) => {
                  const coords = getPositionCoords(player.p);
                  // Mirror Y position for away team (they attack from top)
                  const mirroredTop = 100 - parseFloat(coords.top);
                  const displayName = player.n
                    ? player.n.split(' ').pop() || player.n
                    : player.p;
                  return (
                    <div
                      key={player.id}
                      className="absolute z-20"
                      style={{ top: `${mirroredTop}%`, left: coords.left, transform: 'translate(-50%, -50%)' }}
                      title={player.n || player.p}
                    >
                      <div className="w-8 h-8 rounded-full border border-secondary/50 player-glow-away flex items-center justify-center">
                        <span className="font-headline font-extrabold text-[10px] text-secondary">
                          {displayName.substring(0, 3)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              /* Fallback placeholder players when no snapshot */
              <>
                <div className="absolute top-[20%] left-[15%] z-20">
                  <div className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-primary">GK</span>
                  </div>
                </div>
                <div className="absolute top-[35%] left-[8%] z-20">
                  <div className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-primary">LB</span>
                  </div>
                </div>
                <div className="absolute top-[35%] left-[25%] z-20">
                  <div className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-primary">CB</span>
                  </div>
                </div>
                <div className="absolute top-[35%] left-[40%] z-20">
                  <div className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-primary">CB</span>
                  </div>
                </div>
                <div className="absolute top-[35%] right-[25%] z-20">
                  <div className="w-8 h-8 rounded-full border border-primary/50 player-glow-home flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-primary">RB</span>
                  </div>
                </div>
                <div className="absolute top-[55%] left-[8%] z-20">
                  <div className="w-8 h-8 rounded-full border border-secondary/50 player-glow-away flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-secondary">GK</span>
                  </div>
                </div>
                <div className="absolute top-[70%] right-[8%] z-20">
                  <div className="w-8 h-8 rounded-full border border-secondary/50 player-glow-away flex items-center justify-center">
                    <span className="font-headline font-extrabold text-[10px] text-secondary">RB</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Commentary Bar */}
          <div className="h-[160px] glass-panel rounded-2xl px-5 py-3 flex flex-col flex-shrink-0">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-primary/5">
              <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Live Commentary
              </h3>
              <span className="text-[9px] font-label text-outline uppercase tracking-widest">
                {events.length} events
              </span>
            </div>
            <div className="flex-grow overflow-y-auto space-y-2 pr-2">
              {events.slice(-6).reverse().map((event, idx) => {
                const type = (event.typeName || event.type || '').toUpperCase();
                const text = formatEventCommentary(event, homeName, awayName, (key: string) => key);
                if (!text) return null;
                const isLatest = idx === 0;

                // Determine event team affiliation
                // Neutral events: HALF_TIME, FULL_TIME, KICKOFF, SECOND_HALF_START, WEATHER_ANNOUNCEMENT, PLAYER_INTRODUCTION, etc.
                const neutralTypes = ['HALF_TIME', 'FULL_TIME', 'KICKOFF', 'SECOND_HALF_START', 'EXTRA_TIME_START', 'PENALTY_START', 'WEATHER_ANNOUNCEMENT', 'PLAYER_INTRODUCTION', 'MATCH_START'];
                const isNeutral = neutralTypes.includes(type) || type === 'SNAPSHOT';
                const isHomeEvent = event.isHome === true && !isNeutral;
                const isAwayEvent = event.isHome === false && !isNeutral;

                // Color scheme based on team
                const teamColor = isHomeEvent
                  ? 'bg-primary'
                  : isAwayEvent
                    ? 'bg-secondary'
                    : 'bg-surface-container';
                const textColor = isLatest
                  ? 'text-white font-medium'
                  : isHomeEvent
                    ? 'text-primary'
                    : isAwayEvent
                      ? 'text-secondary'
                      : 'text-on-surface-variant';
                const minuteBg = isLatest
                  ? isHomeEvent
                    ? 'bg-primary text-on-primary'
                    : isAwayEvent
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container text-on-surface-variant'
                  : teamColor.replace('bg-', 'bg-') + ' text-on-surface-variant';

                return (
                  <div key={event.id || idx} className="flex items-start gap-2">
                    <span
                      className={`font-black font-headline text-xs px-1.5 py-0.5 rounded w-7 text-center flex-shrink-0 ${minuteBg}`}
                    >
                      {event.minute}&apos;
                    </span>
                    <p className={`text-xs leading-relaxed ${textColor}`}>
                      {text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Squad Monitor + Stats */}
        <aside className="w-72 flex flex-col gap-4 flex-shrink-0">
          {/* Squad Monitor */}
          <div className="flex-1 glass-panel rounded-2xl p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline font-bold text-xs tracking-tight text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">monitoring</span>
                Squad Monitor
              </h2>
            </div>
            <div className="flex-grow overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-label uppercase tracking-widest text-outline border-b border-primary/5">
                    <th className="pb-2 font-medium">Player</th>
                    <th className="pb-2 font-medium text-center">Pos</th>
                    <th className="pb-2 font-medium text-center">Perf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {/* Real players from snapshot */}
                  {snapshot?.h.ps.slice(0, 8).map((p) => (
                    <tr key={p.id} className="group hover:bg-primary/5 transition-colors">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="text-xs font-headline font-bold text-on-surface" title={p.n}>
                            {p.n || p.id.substring(0, 8)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-center text-[10px] font-bold text-outline uppercase">
                        {p.p}
                      </td>
                      <td className="py-2 text-center">
                        <div className="flex justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className="material-symbols-outlined text-[10px]"
                              style={{
                                color: 'var(--primary)',
                                opacity: s <= Math.round(p.sr / 20) ? 1 : 0.2,
                              }}
                            >
                              star
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Match Stats */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline font-bold text-xs tracking-tight text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">equalizer</span>
                Match Stats
              </h2>
            </div>
            <div className="space-y-3">
              {/* Possession */}
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-label uppercase tracking-widest text-outline">
                  <span>Possession</span>
                </div>
                <div className="h-1.5 w-full bg-surface-container-highest rounded-full overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: '52%' }} />
                  <div className="h-full bg-secondary" style={{ width: '48%' }} />
                </div>
                <div className="flex justify-between font-headline font-black text-xs">
                  <span className="text-primary">52%</span>
                  <span className="text-secondary">48%</span>
                </div>
              </div>

              {/* Shots */}
              <div className="grid grid-cols-2 gap-3 py-2 border-y border-primary/5">
                <div className="text-center">
                  <div className="text-[9px] font-label uppercase tracking-widest text-outline mb-1">
                    Shots
                  </div>
                  <div className="font-headline font-black text-white text-lg">
                    {stats.homeTeamStats.shots ?? 0}{' '}
                    <span className="text-primary/40 text-xs font-medium">
                      ({stats.homeTeamStats.shotsOnTarget ?? 0})
                    </span>
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[9px] font-label uppercase tracking-widest text-outline mb-1">
                    Attacks
                  </div>
                  <div className="font-headline font-black text-white text-lg">84</div>
                </div>
              </div>

              {/* Intensity Chart */}
              <div className="pt-1">
                <div className="text-[9px] font-label uppercase tracking-widest text-outline mb-2 flex justify-between">
                  <span>Intensity</span>
                  <span className="text-primary">Peak (92)</span>
                </div>
                <div className="flex items-end gap-[2px] h-12">
                  {[
                    30, 45, 70, 85, 100, 90, 60, 40, 20, 30,
                  ].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 bg-primary/20 rounded-t-sm"
                      style={{
                        height: `${h}%`,
                        background:
                          h === 100
                            ? 'var(--primary)'
                            : h > 70
                              ? 'var(--primary)'
                              : h > 40
                                ? 'var(--primary)'
                                : 'var(--primary)',
                        opacity: h / 100,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
