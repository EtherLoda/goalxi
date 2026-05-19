'use client';

import type { MatchEvent, MatchStatsRes, Match } from '@/lib/api';

interface MatchReportProps {
  match: {
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
    completedAt?: string | Date;
  };
  events: MatchEvent[];
  stats: MatchStatsRes;
}

interface Goalscorer {
  playerName: string;
  minute: number;
  isHome: boolean;
  assistName?: string;
}

export function MatchReport({ match, events, stats }: MatchReportProps) {
  const homeName = match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.name || 'Away';

  // Extract goalscorers
  const goalscorers: Goalscorer[] = events
    .filter((e) => {
      const type = (e.typeName || e.type || '').toUpperCase();
      return type === 'GOAL' || type === 'OWN_GOAL';
    })
    .map((e) => {
      const data = e.data as any;
      return {
        playerName: data?.playerName || data?.scorer?.name || e.data?.player?.name || 'Unknown',
        minute: e.minute,
        isHome: e.isHome ?? true,
        assistName: data?.assistName || data?.assister?.name || null,
      };
    })
    .sort((a, b) => a.minute - b.minute);

  const homeXG = stats.homeComputed.xG;
  const awayXG = stats.awayComputed.xG;
  const dominantTeam = homeXG >= awayXG ? homeName.split(' ')[0] : awayName.split(' ')[0];

  const homeGoals = goalscorers.filter((g) => g.isHome);
  const awayGoals = goalscorers.filter((g) => !g.isHome);

  const formatDate = (date?: string | Date) => {
    if (!date) return '';
    try {
      const d = typeof date === 'string' ? new Date(date) : date;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="rounded-DEFAULT border border-surface-container-high bg-surface-container-low overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
        <h3 className="font-headline font-bold text-xs uppercase tracking-widest text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm text-primary">article</span>
          Match Report
        </h3>
        {match.completedAt && (
          <p className="text-[10px] text-on-surface-variant font-headline">
            {formatDate(match.completedAt)}
          </p>
        )}
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Score Grid */}
        <div className="flex items-center justify-center gap-6 py-2">
          <div className="text-center flex-1">
            <div className="text-4xl font-black font-headline text-on-surface">{match.homeScore ?? 0}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mt-1 font-headline truncate">
              {homeName}
            </div>
          </div>
          <div className="text-2xl font-black text-on-surface-variant font-headline">-</div>
          <div className="text-center flex-1">
            <div className="text-4xl font-black font-headline text-on-surface">{match.awayScore ?? 0}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mt-1 font-headline truncate">
              {awayName}
            </div>
          </div>
        </div>

        <div className="border-t border-surface-container-high" />

        {/* Goalscorers */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-3 font-headline">
            Goals
          </div>
          {goalscorers.length === 0 ? (
            <p className="text-xs text-on-surface-variant font-headline">No goals scored</p>
          ) : (
            <div className="space-y-3">
              {homeGoals.length > 0 && (
                <div className="space-y-1.5">
                  {homeGoals.map((g, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span className="text-xs text-on-surface">{g.playerName}</span>
                        {g.assistName && (
                          <span className="text-[10px] text-on-surface-variant">assist {g.assistName}</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] font-black text-primary">{g.minute}&apos;</span>
                    </div>
                  ))}
                </div>
              )}

              {awayGoals.length > 0 && (
                <div className="space-y-1.5">
                  {awayGoals.map((g, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                        <span className="text-xs text-on-surface">{g.playerName}</span>
                        {g.assistName && (
                          <span className="text-[10px] text-on-surface-variant">assist {g.assistName}</span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] font-black text-secondary">{g.minute}&apos;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-surface-container-high" />

        {/* Key Stats Mini Grid */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-surface-container rounded-lg p-2.5">
            <div className="text-xl font-black font-headline text-primary">{stats.homeComputed.goals}</div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mt-0.5 font-headline">
              Home
            </div>
          </div>
          <div className="bg-surface-container rounded-lg p-2.5">
            <div className={`text-xl font-black font-headline ${homeXG >= awayXG ? 'text-primary' : 'text-secondary'}`}>
              {stats.homeComputed.xG.toFixed(2)}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mt-0.5 font-headline">
              Home xG
            </div>
          </div>
          <div className="bg-surface-container rounded-lg p-2.5">
            <div className={`text-xl font-black font-headline ${homeXG >= awayXG ? 'text-primary' : 'text-secondary'}`}>
              {dominantTeam}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant mt-0.5 font-headline">
              Dom.
            </div>
          </div>
        </div>

        {/* Discipline */}
        {(stats.homeTeamStats.yellowCards > 0 || stats.awayTeamStats.yellowCards > 0 ||
          stats.homeTeamStats.redCards > 0 || stats.awayTeamStats.redCards > 0) && (
          <>
            <div className="border-t border-surface-container-high pt-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2 font-headline">
                Discipline
              </div>
              <div className="flex justify-between text-xs">
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-bold">
                    {stats.homeTeamStats.yellowCards > 0 && `${stats.homeTeamStats.yellowCards}🟨`}
                  </span>
                  <span className="text-red-400 font-bold">
                    {stats.homeTeamStats.redCards > 0 && `${stats.homeTeamStats.redCards}🟥`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-yellow-400 font-bold">
                    {stats.awayTeamStats.yellowCards > 0 && `${stats.awayTeamStats.yellowCards}🟨`}
                  </span>
                  <span className="text-red-400 font-bold">
                    {stats.awayTeamStats.redCards > 0 && `${stats.awayTeamStats.redCards}🟥`}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
