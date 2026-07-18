'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, type MatchEvent, type MatchStatsRes, type Match, type Player, type Tactics } from '@/lib/api';
import { formatEventCommentary } from '@/lib/commentary';
import { MatchPitch, type MatchSnapshot } from './MatchPitch';
import { MatchTimeline } from './MatchTimeline';
import { buildCards } from './match-pitch-data';
import { extractSnapshots } from './snapshot-stats';
import { BenchStrip } from '../tactics/bench/BenchStrip';
import { normalizePitchLineup } from './pitch-coords';
import { toPitchSlot } from '../tactics/api-helpers';

interface TacticalMatchDetailProps {
  matchId: string;
  match: {
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { id?: string; name?: string; logoUrl?: string | null };
    awayTeam?: { id?: string; name?: string; logoUrl?: string | null };
    status?: string;
    scheduledAt?: string | Date;
    /**
     * Forfeit flags from the API. When set, the simulator never ran
     * the match — no SNAPSHOT events were emitted. The match page must
     * render an empty pitch + forfeit banner rather than the submitted
     * lineups (which were never actually played).
     */
    homeForfeit?: boolean;
    awayForfeit?: boolean;
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

interface SnapshotData {
  h: {
    n?: string;
    ls: { left: any; center: any; right: any };
    // Lane counters: `att`/`ps_` are empirical, `pr`/`mpr` are
    // engine-computed expected probabilities. The match report's
    // Push Success Rate / Possession Share panels read `pr`/`mpr`
    // directly — see `snapshot-stats.ts` for the consumer side.
    lc?: {
      left: { att: number; ps_: number; pr: number; mpr: number };
      center: { att: number; ps_: number; pr: number; mpr: number };
      right: { att: number; ps_: number; pr: number; mpr: number };
    };
    gk: number;
    ps: Array<{
      id: string;
      p: string;
      n?: string;
      st: number;
      sr: number;
      em: number;
    }>;
  };
  a: {
    n?: string;
    ls: { left: any; center: any; right: any };
    lc?: {
      left: { att: number; ps_: number; pr: number; mpr: number };
      center: { att: number; ps_: number; pr: number; mpr: number };
      right: { att: number; ps_: number; pr: number; mpr: number };
    };
    gk: number;
    ps: Array<{
      id: string;
      p: string;
      n?: string;
      st: number;
      sr: number;
      em: number;
    }>;
  };
}

/**
 * Extract the latest snapshot event from match events and narrow it to the
 * shape `MatchPitch` consumes (only `h.ps` / `a.ps` are needed; the rest of
 * `SnapshotData` is informational and dropped here).
 */
function getLatestSnapshot(events: MatchEvent[]): MatchSnapshot | null {
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

  const data = (latest as any).data as SnapshotData | undefined;
  if (!data) return null;
  // Carry the snapshot's minute + lane payloads through — the zone panel
  // reads `ls`/`lc` and the scrubber reads `minute`. Older simulator
  // versions pre-dating the lane fields will leave them undefined; the
  // helpers in `snapshot-stats.ts` handle that case.
  return {
    minute: latest.minute ?? 0,
    h: {
      ls: data.h?.ls,
      lc: data.h?.lc,
      gk: data.h?.gk,
      ps: data.h?.ps ?? [],
    },
    a: {
      ls: data.a?.ls,
      lc: data.a?.lc,
      gk: data.a?.gk,
      ps: data.a?.ps ?? [],
    },
  };
}

export function TacticalMatchDetail({
  matchId,
  match,
  events,
  stats,
  currentMinute = 90,
}: TacticalMatchDetailProps) {
  const homeName = match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.name || 'Away';
  const isLive = match.status === 'in_progress';
  // Pitch stats overlay toggle — when on, the pitch swaps player dots
  // for a 3×3 lane×phase grid (PitchStatsOverlay). Default off; local
  // state because the toggle is view-only, no URL persistence.
  const [statsMode, setStatsMode] = useState(false);
  // Forfeit state is forwarded to <MatchPitch> as `homeForfeit` /
  // `awayForfeit` props; the page itself doesn't need to gate any UI
  // on forfeit anymore — benches + player dots render in all cases
  // (the simulator now emits intro events for forfeits too).
  const homeTeamId = match.homeTeam?.id;
  const awayTeamId = match.awayTeam?.id;
  // Same scoped hook as LiveCommentary — the formatter strips the
  // `commentary.` prefix in `getTemplate` so a bare `useTranslations()`
  // would otherwise render the literal dotted key.
  const tCommentary = useTranslations('commentary');
  // Heading chrome (was hardcoded "Live Commentary").
  const tLiveChrome = useTranslations('matches.live');
  const tChip = useTranslations('matches.bento.pitchChip');

  // Extract snapshot for real player positions
  const snapshot = getLatestSnapshot(events);

  // Lift "which snapshot is active" to page-level state so the
  // SnapshotZonePanel scrubber can drive it. Default is the latest
  // snapshot — pre-scrubber behavior — and the panel calls onChange
  // (on mouseup / touchend, never mid-drag) to swap to an earlier one.
  // Both MatchPitch and SnapshotZonePanel read from `activeSnapshot`,
  // so the pitch's player markers and the panel's lane stats always
  // show the same minute.
  const allSnapshots = useMemo(
    () => extractSnapshots(events),
    [events],
  );
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    () => Math.max(0, allSnapshots.length - 1),
  );
  // If new snapshots arrive (e.g. live match), keep the index in range
  // and snap to the latest so the reader always sees fresh data.
  useEffect(() => {
    setActiveSnapshotIndex((idx) =>
      Math.min(idx, Math.max(0, allSnapshots.length - 1)),
    );
  }, [allSnapshots.length]);
  const activeSnapshot: MatchSnapshot | null =
    allSnapshots[activeSnapshotIndex] ?? null;

  // [Live-page fix] Fetch the match's submitted tactics + both teams' player
  // rosters so we can render real player dots whenever the event stream
  // carries no SNAPSHOT (the common case for kickoff-only / forfeit
  // / full_time matches). Snapshot remains primary — it reflects mid-game
  // stamina/star-rating — lineup+roster is the fallback.
  //
  // Roster is split per team rather than merged so the bench strip can
  // resolve each side's BENCH_* slots without contaminating home/away
  // playerId namespaces.
  const [homeTactics, setHomeTactics] = useState<Tactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<Tactics | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tacticsPromise = api.matches.getTactics(matchId);
        const homeRosterPromise = homeTeamId
          ? api.players.getByTeam(homeTeamId)
          : Promise.resolve({ items: [] as Player[], meta: {} });
        const awayRosterPromise = awayTeamId
          ? api.players.getByTeam(awayTeamId)
          : Promise.resolve({ items: [] as Player[], meta: {} });
        const [tactics, homeRosterRes, awayRosterRes] = await Promise.all([
          tacticsPromise,
          homeRosterPromise,
          awayRosterPromise,
        ]);
        if (cancelled) return;
        setHomeTactics(tactics.homeTactics);
        setAwayTactics(tactics.awayTactics);
        setHomeRoster(homeRosterRes.items ?? []);
        setAwayRoster(awayRosterRes.items ?? []);
      } catch {
        // Swallow — MatchPitch renders an empty pitch and benches render
        // empty slots when nothing has loaded.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, homeTeamId, awayTeamId]);

  // playerId → Player lookup for fast resolution. Combined so snapshot
  // playerIds (which may reference either team) resolve correctly.
  const rosterById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of homeRoster) map.set(p.id, p);
    for (const p of awayRoster) map.set(p.id, p);
    return map;
  }, [homeRoster, awayRoster]);

  // Per-team rosters keyed by id, used by the bench strip.
  const homeRosterById = useMemo(
    () => new Map(homeRoster.map((p) => [p.id, p])),
    [homeRoster],
  );
  const awayRosterById = useMemo(
    () => new Map(awayRoster.map((p) => [p.id, p])),
    [awayRoster],
  );

  // Pull bench slots out of the lineup. The match page never renders
  // the pitch-side lineupPlayers mapping any more — MatchPitch owns
  // that — but the bench needs the BENCH_* entries.
  const homeBench = useMemo(
    () => (homeTactics?.lineup ? normalizePitchLineup(homeTactics.lineup).bench : {}),
    [homeTactics],
  );
  const awayBench = useMemo(
    () => (awayTactics?.lineup ? normalizePitchLineup(awayTactics.lineup).bench : {}),
    [awayTactics],
  );

  // Squad Monitor's lineup fallback (when no SNAPSHOT event is in the
  // stream) uses the same merger as the pitch — single source of truth
  // for "which players are on the pitch for home".
  const homeLineupCards = useMemo(
    () => buildCards(homeTactics, snapshot?.h.ps ?? null, rosterById),
    [homeTactics, snapshot, rosterById],
  );

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
      <header className="glass-panel rounded-2xl px-6 py-3 flex items-center justify-between relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

        {/* Home Team */}
        <div className="flex items-center gap-4 z-10 flex-1">
          <div className="text-right grow">
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
          <div className="text-left grow">
            <div className="font-headline font-bold text-lg tracking-tight text-white uppercase">
              {awayName}
            </div>
            <div className="text-[9px] font-label uppercase tracking-widest text-secondary/60">
              Away
            </div>
          </div>
        </div>
      </header>

      {/* Match timeline — spans the full width above the pitch + zone
          panel. Same component as the live page so live + report share
          one visual language. Clickable event markers (goals / subs /
          cards) drive the same `activeSnapshotIndex` state the
          scrubber used to own. */}
      <MatchTimeline
        events={events}
        snapshots={allSnapshots}
        currentMinute={currentMinute}
        activeIndex={activeSnapshotIndex}
        onChange={setActiveSnapshotIndex}
      />

      {/* Horizontal pitch — full width, then benches below.
          Layout: header → pitch → home/away benches → (commentary | sidebar).
          The pitch is intentionally OUT of the left column so its aspect-video
          aspect ratio is preserved at the page's natural width. */}
      {/* Pitch + zone panel: pitch on the left (1fr), zone panel on the
          right (320px) at the same row. The timeline above drives
          `activeSnapshotIndex` which in turn drives the pitch's player
          markers — moving the timeline re-renders BOTH pieces together
          once the user settles (mouseup / touchend). Below lg, the
          panel stacks under the pitch. */}
      {/* Pitch + stats toggle. The chip lives OUTSIDE the pitch's
          overflow-hidden container so it's never clipped. The
          PitchStatsOverlay itself is still rendered by MatchPitch
          based on `statsMode` — we just hand the state down via the
          `statsMode` + `onToggleStatsMode` props. */}
      <div className="relative">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setStatsMode((v) => !v)}
            aria-pressed={statsMode}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-headline font-bold text-sm transition-all ring-2 shadow-lg ${
              statsMode
                ? 'bg-primary text-on-primary ring-primary shadow-[0_0_16px_rgba(0,228,121,0.45)]'
                : 'bg-surface-container-low text-on-surface ring-primary/60 hover:bg-surface-container-high shadow-md'
            }`}
            data-testid="pitch-stats-toggle"
          >
            <span className="material-symbols-outlined text-base">
              {statsMode ? 'group' : 'monitoring'}
            </span>
            <span>
              {statsMode ? tChip('playersView') : tChip('statsView')}
            </span>
          </button>
        </div>
        <MatchPitch
          homeTactics={homeTactics}
          awayTactics={awayTactics}
          homeRoster={homeRoster}
          awayRoster={awayRoster}
          activeSnapshot={activeSnapshot}
          statsMode={statsMode}
          onToggleStatsMode={() => setStatsMode((v) => !v)}
          homeForfeit={match.homeForfeit ?? false}
          awayForfeit={match.awayForfeit ?? false}
          homeTeamName={homeName}
          awayTeamName={awayName}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Editor's BenchStrip in view-only mode (no drag handlers) — renders
            identical "Substitutes" header + slot badge + PlayerMarker row
            that the editor shows. Forfeit matches show the submitted
            benches too — the page surfaces the lineups even when no
            simulator ran, so the user can see "who would have played"
            alongside the forfeit banner + commentary intro events. */}
        <BenchStrip
          bench={homeBench as Record<string, string | null>}
          playersById={homeRosterById}
          isDragging={false}
          onDrop={() => {}}
          onRemove={() => {}}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
        <BenchStrip
          bench={awayBench as Record<string, string | null>}
          playersById={awayRosterById}
          isDragging={false}
          onDrop={() => {}}
          onRemove={() => {}}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grow flex gap-4 min-h-0">
        {/* Left & Center: Commentary */}
        <div className="flex-1 flex flex-col gap-4 min-h-0">

          {/* Commentary Bar.
              Was `h-40` (160px fixed) — too narrow once a match accumulates
              more than ~4 events. Switched to `flex-1 min-h-0` so it fills
              the remaining column height, and added `min-h-0` on the events
              list so flexbox actually lets it shrink below its intrinsic
              content height — that's what makes `overflow-y-auto` engage. */}
          <div className="flex-1 min-h-0 glass-panel rounded-2xl px-5 py-3 flex flex-col">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-primary/5 shrink-0">
              <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {tLiveChrome('commentary')}
              </h3>
              <span className="text-[9px] font-label text-outline uppercase tracking-widest">
                {events.length} events
              </span>
            </div>
            <div className="grow min-h-0 overflow-y-auto space-y-2 pr-2">
              {events.slice().reverse().map((event, idx) => {
                const type = (event.typeName || event.type || '').toUpperCase();
                const text = formatEventCommentary(event, homeName, awayName, tCommentary);
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
                      className={`font-black font-headline text-xs px-1.5 py-0.5 rounded w-7 text-center shrink-0 ${minuteBg}`}
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
        <aside className="w-72 flex flex-col gap-4 shrink-0">
          {/* Squad Monitor */}
          <div className="flex-1 glass-panel rounded-2xl p-4 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-headline font-bold text-xs tracking-tight text-white uppercase flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-base">monitoring</span>
                Squad Monitor
              </h2>
            </div>
            <div className="grow overflow-y-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-label uppercase tracking-widest text-outline border-b border-primary/5">
                    <th className="pb-2 font-medium">Player</th>
                    <th className="pb-2 font-medium text-center">Pos</th>
                    <th className="pb-2 font-medium text-center">Perf</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary/5">
                  {/* Real players — snapshot wins (mid-game stamina/star),
                      submitted lineup + roster is the fallback when there
                      is no SNAPSHOT event in the stream. */}
                  {(
                    snapshot
                      ? snapshot.h.ps.map((p) => ({
                          id: p.id,
                          name: p.n ?? p.id.substring(0, 8),
                          // Fold legacy alias keys (CB → CB1, DM → DMF1, etc.)
                          // onto canonical PitchSlot so the table column
                          // shows what the editor would.
                          pos: toPitchSlot(p.p) ?? p.p,
                          sr: p.sr,
                        }))
                      : homeLineupCards
                          .filter((c) => c.slotKey !== null)
                          .map((c) => ({
                            id: c.playerId,
                            name: c.name,
                            // Slot key is the authoritative PitchSlot
                            // (CB1, DMF1, etc.) — drop the fallback null case.
                            pos: c.slotKey ?? '',
                            sr: rosterById.get(c.playerId)?.overall ?? 0,
                          }))
                  )
                    .slice(0, 8)
                    .map((row) => (
                    <tr key={row.id} className="group hover:bg-primary/5 transition-colors">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="text-xs font-headline font-bold text-on-surface" title={row.name}>
                            {row.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-center text-[10px] font-bold text-outline uppercase">
                        {row.pos}
                      </td>
                      <td className="py-2 text-center">
                        <div className="flex justify-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className="material-symbols-outlined text-[10px]"
                              style={{
                                color: 'var(--primary)',
                                opacity: s <= Math.round((row.sr ?? 0) / 20) ? 1 : 0.2,
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
                <div className="flex items-end gap-0.5 h-12">
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
