'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  api,
  MAX_FORECAST_DAYS,
  type MatchEvent,
  type MatchStatsRes,
  type Player,
  type Tactics,
  type WeatherForecastEntry,
  type WeatherForecastRes,
  type WeatherType,
} from '@/lib/api';
import { MatchPitch, type MatchSnapshot } from './MatchPitch';
import { MatchTimeline } from './MatchTimeline';
import { buildCards } from './match-pitch-data';
import { LiveCommentary } from './LiveCommentary';
import { extractSnapshots } from './snapshot-stats';
import { normalizePitchLineup } from './pitch-coords';
import { toPitchSlot } from '../tactics/api-helpers';
import { MatchInfoPanel } from './MatchInfoPanel';
import { MatchKeyEvents } from './MatchKeyEvents';
import { MatchSubstitutes } from './MatchSubstitutes';
import { StatsResult } from './StatsResult';
import { extractSidebarData } from './match-sidebar-data';

interface TacticalMatchDetailProps {
  matchId: string;
  match: {
    homeScore?: number | null;
    awayScore?: number | null;
    homeTeam?: { id?: string; name?: string; logoUrl?: string | null };
    awayTeam?: { id?: string; name?: string; logoUrl?: string | null };
    status?: string;
    scheduledAt?: string | Date;
    homeForfeit?: boolean;
    awayForfeit?: boolean;
    /** Stadium name where the match is played. */
    venue?: string | null;
    /**
     * Match-day weather (denormalised onto the match by the scheduler and
     * simulator). The frontend should use this field directly and only
     * fall back to `weather_announcement` events if it's missing.
     */
    weather?: WeatherType | null;
    /** Match-day attendance (home crowd). */
    attendance?: number | null;
  };
  events: MatchEvent[];
  /** May be null for matches that haven't started yet (no recorded stats). */
  stats?: MatchStatsRes | null;
  currentMinute?: number;
}

interface SnapshotData {
  h: {
    n?: string;
    ls: { left: any; center: any; right: any };
    lc?: {
      left: { att: number; ps_: number; pr: number; mpr: number };
      center: { att: number; ps_: number; pr: number; mpr: number };
      right: { att: number; ps_: number; pr: number; mpr: number };
    };
    gk: number;
    ps: Array<{
      id: number;
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
      id: number;
      p: string;
      n?: string;
      st: number;
      sr: number;
      em: number;
    }>;
  };
}

function getLatestSnapshot(events: MatchEvent[]): MatchSnapshot | null {
  const snapshots = events.filter(
    (e) => (e.typeName || e.type || '').toUpperCase() === 'SNAPSHOT'
  );
  if (snapshots.length === 0) return null;

  const latest = snapshots.reduce((prev, curr) => {
    const prevMinute = (prev as any).minute ?? 0;
    const currMinute = (curr as any).minute ?? 0;
    return currMinute > prevMinute ? curr : prev;
  });

  const data = (latest as any).data as SnapshotData | undefined;
  if (!data) return null;

  return {
    minute: latest.minute ?? 0,
    h: { ls: data.h?.ls, lc: data.h?.lc, gk: data.h?.gk, ps: data.h?.ps ?? [] },
    a: { ls: data.a?.ls, lc: data.a?.lc, gk: data.a?.gk, ps: data.a?.ps ?? [] },
  };
}

/** Maps a weather type to the emoji shown in the pre-match card. */
function weatherEmoji(w: WeatherType | string): string {
  const key = w.toLowerCase();
  if (key.includes('storm')) return '⛈️';
  if (key.includes('rain')) return '🌧️';
  if (key.includes('snow')) return '❄️';
  if (key.includes('fog')) return '🌫️';
  if (key.includes('wind')) return '💨';
  if (key.includes('cloud')) return '☁️';
  return '☀️';
}

/**
 * Derive the minute shown in the report-mode chrome (timeline + commentary
 * header + score chip). Earlier this was hard-coded to 90, which broke
 * forfeit / cancelled / extra-time matches (timeline 100% full, scrubber
 * a no-op) and the report UI lied about how long the match actually ran.
 * Now: 90 baseline, lifted to whatever the latest event recorded so the
 * reader can scrub back into the closing minutes of a 120-minute cup tie.
 */
function getReportCurrentMinute(events: MatchEvent[]): number {
  let max = 0;
  for (const e of events) {
    if (e.minute > max) max = e.minute;
  }
  return Math.max(90, max);
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
  // Matches that haven't started yet (SCHEDULED, PENDING, etc.) have no
  // events, no snapshots and no per-team stats. Showing the pitch / bench
  // / commentary / lane stats would be misleading, so we collapse the page
  // to just the score header and a small pre-match card.
  const isCompleted = match.status === 'completed';
  const isPreMatch = !isLive && !isCompleted;
  // Derive the minute the report-mode chrome should show. See
  // `getReportCurrentMinute` for the rationale (was hard-coded 90;
  // broke forfeit/extra-time cases).
  const reportCurrentMinute = useMemo(
    () => currentMinute ?? getReportCurrentMinute(events),
    [currentMinute, events],
  );
  const [statsMode, setStatsMode] = useState(false);
  const homeTeamId = match.homeTeam?.id;
  const awayTeamId = match.awayTeam?.id;
  const tLiveChrome = useTranslations('matches.live');
  const tChip = useTranslations('matches.bento.pitchChip');

  const snapshot = getLatestSnapshot(events);

  const allSnapshots = useMemo(() => extractSnapshots(events), [events]);
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(
    () => Math.max(0, allSnapshots.length - 1),
  );
  useEffect(() => {
    setActiveSnapshotIndex((idx) =>
      Math.min(idx, Math.max(0, allSnapshots.length - 1)),
    );
  }, [allSnapshots.length]);
  const activeSnapshot: MatchSnapshot | null = allSnapshots[activeSnapshotIndex] ?? null;

  const [homeTactics, setHomeTactics] = useState<Tactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<Tactics | null>(null);
  const [homeRoster, setHomeRoster] = useState<Player[]>([]);
  const [awayRoster, setAwayRoster] = useState<Player[]>([]);

  // Pre-match only: predicted weather for the kickoff date. We don't need
  // to fetch this once the match has started (the simulator reveals the
  // actual weather via a `weather_announcement` event).
  //
  // Beyond MAX_FORECAST_DAYS we skip the call entirely — typical weather
  // services only have meaningful predictions for ~7 days. The UI shows
  // an "out of range" hint in that case.
  const [forecast, setForecast] = useState<WeatherForecastRes | null>(null);
  const daysUntilMatch = useMemo(() => {
    if (!match.scheduledAt) return 0;
    const ms = new Date(match.scheduledAt).getTime() - Date.now();
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }, [match.scheduledAt]);
  const isForecastAvailable =
    isPreMatch && daysUntilMatch > 0 && daysUntilMatch <= MAX_FORECAST_DAYS;
  useEffect(() => {
    if (!isForecastAvailable) {
      setForecast(null);
      return;
    }
    const date = new Date(match.scheduledAt!).toISOString().slice(0, 10);
    let cancelled = false;
    api.weather
      .getForecast(date)
      .then((res) => {
        if (!cancelled) setForecast(res);
      })
      .catch(() => {
        // Non-fatal — the UI falls back to a "TBD" label.
        if (!cancelled) setForecast(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isForecastAvailable, match.scheduledAt]);

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
        // Swallow
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, homeTeamId, awayTeamId]);

  const rosterById = useMemo(() => {
    const map = new Map<number, Player>();
    for (const p of homeRoster) map.set(p.id, p);
    for (const p of awayRoster) map.set(p.id, p);
    return map;
  }, [homeRoster, awayRoster]);

  // String-keyed roster map for the MatchKeyEvents panel. MatchKeyEvents
  // (and MatchEvent.playerId) work in string keys, but Player.id is a
  // number — convert at lookup time so the two stay in sync.
  const rosterByIdForKeys = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const p of homeRoster) map.set(String(p.id), { name: p.name });
    for (const p of awayRoster) map.set(String(p.id), { name: p.name });
    return map;
  }, [homeRoster, awayRoster]);

  const homeRosterById = useMemo(() => new Map(homeRoster.map((p) => [p.id, p])), [homeRoster]);
  const awayRosterById = useMemo(() => new Map(awayRoster.map((p) => [p.id, p])), [awayRoster]);

  const homeBench = useMemo(
    () => (homeTactics?.lineup ? normalizePitchLineup(homeTactics.lineup).bench : {}),
    [homeTactics],
  );
  const awayBench = useMemo(
    () => (awayTactics?.lineup ? normalizePitchLineup(awayTactics.lineup).bench : {}),
    [awayTactics],
  );

  const homeLineupCards = useMemo(
    () => buildCards(homeTactics, snapshot?.h.ps ?? null, rosterById),
    [homeTactics, snapshot, rosterById],
  );

  // Prefer the denormalised match fields — the scheduler and simulator are
  // the single source of truth. Only fall back to the legacy
  // `weather_announcement` event payload if those are missing (older rows
  // before this column was added, or corrupted data).
  const { keyEvents, weather: eventWeather, attendance: eventAttendance } =
    useMemo(() => extractSidebarData(events), [events]);
  const resolvedWeather: WeatherType | string | null =
    match.weather ?? eventWeather;
  const resolvedAttendance: number | null =
    match.attendance ?? eventAttendance;
  const resolvedVenue: string | null = match.venue ?? null;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Floating Score Header */}
      <header className="glass-panel rounded-2xl px-6 py-3 flex items-center justify-between relative overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-linear-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />

        <div className="flex items-center gap-4 z-10 flex-1 min-w-0">
          <div className="text-right grow min-w-0">
            <div className="font-headline font-bold text-sm md:text-lg tracking-tight text-white uppercase truncate">
              {homeName}
            </div>
            <div className="text-[9px] font-label uppercase tracking-widest text-primary/60">
              Home
            </div>
          </div>
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-primary/10 blur-xl rounded-full" />
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center relative z-10 border border-primary/20">
              <span className="text-primary font-black text-xs">{homeName.charAt(0)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center z-10 px-3 md:px-6 shrink-0">
          <div className="flex items-center gap-2 md:gap-4">
            <span className="text-4xl md:text-5xl font-headline font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] tabular-nums">
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
            <span className="text-4xl md:text-5xl font-headline font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.15)] tabular-nums">
              {match.awayScore ?? 0}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 z-10 flex-1 justify-end min-w-0">
          <div className="relative shrink-0">
            <div className="absolute inset-0 bg-secondary/10 blur-xl rounded-full" />
            <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center relative z-10 border border-secondary/20">
              <span className="text-secondary font-black text-xs">{awayName.charAt(0)}</span>
            </div>
          </div>
          <div className="text-left grow min-w-0">
            <div className="font-headline font-bold text-sm md:text-lg tracking-tight text-white uppercase truncate">
              {awayName}
            </div>
            <div className="text-[9px] font-label uppercase tracking-widest text-secondary/60">
              Away
            </div>
          </div>
        </div>
      </header>

      {/* Pre-match: no events, snapshots or stats yet. Show the empty pitch
          (no players — they haven't taken the field) plus a slim right column
          with the venue, kickoff time and a weather-forecast placeholder.
          Everything else (timeline, bench, commentary, key events, lane
          stats) stays hidden because there's no data behind it. */}
      {isPreMatch ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
          {/* LEFT — empty pitch */}
          <MatchPitch
            homeTactics={null}
            awayTactics={null}
            homeRoster={[]}
            awayRoster={[]}
            activeSnapshot={null}
            statsMode={false}
            onToggleStatsMode={() => {}}
            homeForfeit={false}
            awayForfeit={false}
            homeTeamName={homeName}
            awayTeamName={awayName}
          />

          {/* RIGHT — venue + kickoff + weather forecast placeholder */}
          <div className="flex flex-col gap-3">
            <div className="glass-panel rounded-2xl p-4">
              <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-base">stadium</span>
                {tLiveChrome('matchInfo') ?? 'Match Info'}
              </h3>
              <div className="flex flex-col gap-2">
                {/* Venue (stadium) — use the resolved match-level field so
                    pre-match, live and post-match all read from the same
                    source. */}
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-sm">📍</span>
                  <span className="font-headline font-bold text-sm text-white/90">
                    {resolvedVenue ?? tLiveChrome('venueTbd') ?? 'Venue TBD'}
                  </span>
                </div>
                {/* Predicted weather. Priority:
                    1. match.weather (denormalised by the scheduler/simulator)
                    2. forecast from the public /weather/forecast endpoint
                       (only when the match is within MAX_FORECAST_DAYS)
                    3. "out of range" when the match is too far ahead
                    4. "decided at kickoff" as a final fallback. */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      {match.weather
                        ? weatherEmoji(match.weather)
                        : forecast?.forecasts?.[0]
                          ? weatherEmoji(forecast.forecasts[0].weather)
                          : '❔'}
                    </span>
                    <span className="font-headline font-bold text-sm text-white/90">
                      {tLiveChrome('weatherForecastLabel') ?? 'Forecast'}:{' '}
                      {match.weather ? (
                        <span className="capitalize">
                          {String(match.weather).replace('_', ' ')}
                        </span>
                      ) : daysUntilMatch > MAX_FORECAST_DAYS ? (
                        <span className="text-white/60 font-normal">
                          {tLiveChrome('weatherForecastOutOfRange') ??
                            `Out of range (>${MAX_FORECAST_DAYS} days)`}
                        </span>
                      ) : forecast?.forecasts?.[0] ? (
                        <span className="capitalize">
                          {forecast.forecasts[0].weather.replace('_', ' ')}{' '}
                          <span className="text-white/50 font-normal">
                            ({forecast.forecasts[0].probability}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-white/60 font-normal">
                          {tLiveChrome('weatherForecastTbd') ??
                            'Decided at kickoff'}
                        </span>
                      )}
                    </span>
                  </div>
                  {/* Alt-forecast chips — only when we have real data */}
                  {forecast &&
                    forecast.source !== 'out_of_range' &&
                    forecast.forecasts.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {forecast.forecasts.slice(1).map((f: WeatherForecastEntry) => (
                        <span
                          key={f.weather}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-[10px] font-label text-white/60"
                        >
                          <span>{weatherEmoji(f.weather)}</span>
                          <span className="capitalize">
                            {f.weather.replace('_', ' ')}
                          </span>
                          <span className="text-white/40">{f.probability}%</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Kickoff time */}
                {match.scheduledAt && (
                  <div className="flex items-center gap-2">
                    <span className="text-white/40 text-sm">🕒</span>
                    <span className="font-headline font-bold text-sm text-white/90">
                      {tLiveChrome('scheduledFor') ?? 'Kickoff'}:{' '}
                      {new Date(match.scheduledAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {match.status === 'cancelled' && (
                  <p className="text-[10px] font-label text-error uppercase tracking-widest mt-1">
                    {tLiveChrome('cancelled') ?? 'Cancelled'}
                  </p>
                )}
              </div>
            </div>

            {/* Pre-match hint card */}
            <div className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center gap-2">
              <span className="material-symbols-outlined text-3xl text-primary/40">
                event
              </span>
              <p className="text-xs text-on-surface-variant font-headline">
                {tLiveChrome('notStartedBody') ??
                  'Lineups, live stats and the event timeline will appear here once the match kicks off.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Match timeline */}
          <MatchTimeline
            events={events}
            snapshots={allSnapshots}
            currentMinute={reportCurrentMinute}
            activeIndex={activeSnapshotIndex}
            onChange={setActiveSnapshotIndex}
          />

          {/* Grid: left=pitch+sub+commentary, right=matchinfo+keyevents */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
            {/* LEFT — pitch + sub + commentary. min-w-0 lets the flex column
                accept a constrained width — without it grid children with
                intrinsic content width (LiveCommentary's ticker, goal
                spotlight 3-col grid, bubble feeds) push past the 1fr
                track and overflow the page on narrow viewports. */}
            <div className="flex flex-col gap-4 min-w-0">
              {/* Pitch */}
              <div className="space-y-3">
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

              {/* Substitutes — read-only match-report view (planned
                  bench slots + actual subs from the event log). The
                  tactics page still uses the drag-and-drop BenchStrip;
                  here we show settled state, no interaction. */}
              <MatchSubstitutes
                homeTeamName={homeName}
                awayTeamName={awayName}
                homeBench={homeBench}
                awayBench={awayBench}
                homeRosterById={homeRosterById}
                awayRosterById={awayRosterById}
                events={events}
                homeTeamId={homeTeamId}
                awayTeamId={awayTeamId}
              />

              {/* Commentary — same component the live page uses, in 'replay'
                  mode so the header shows "FT" instead of "LIVE" and the
                  dot stops pulsing. The match is over; we're scrubbing
                  history. */}
              <LiveCommentary
                events={events}
                currentMinute={reportCurrentMinute}
                homeTeamName={homeName}
                awayTeamName={awayName}
                homeTeamId={match.homeTeam?.id ?? null}
                awayTeamId={match.awayTeam?.id ?? null}
                homeScore={match.homeScore ?? 0}
                awayScore={match.awayScore ?? 0}
                mode="replay"
              />
            </div>

            {/* RIGHT — Match Info + Key Events + Lane Stats.
                No fixed height — letting the column grow with its content
                (LaneBreakdown alone is ~480px; the previous h-[540px] was
                squeezing Key Events down to ~0px and hiding all events). */}
            <div className="flex flex-col gap-3">
              {/* Match Info — auto-size: now has up to 3 tiles
                  (venue / weather / attendance) and a fixed h-32 was
                  overflowing. */}
              <div className="glass-panel rounded-2xl p-4 shrink-0">
                <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-base">stadium</span>
                  {tLiveChrome('matchInfo') ?? 'Match Info'}
                </h3>
                <MatchInfoPanel
                  stadium={resolvedVenue ?? undefined}
                  weather={resolvedWeather ?? undefined}
                  attendance={resolvedAttendance ?? undefined}
                />
              </div>

              {/* Key Events — uses the same MatchKeyEvents component as
                  the live view so home/away attribution, minute-badge
                  tinting and player name resolution stay in sync.
                  Bounded height: enough room for ~8 events, scrollable
                  past that. Previously the right column was h-[540px] and
                  LaneBreakdown consumed ~480px, squeezing this panel to
                  ~0px — hence "no events visible". */}
              <div className="glass-panel rounded-2xl p-4 flex flex-col min-h-[200px] max-h-[420px]">
                <h3 className="font-headline font-bold text-[10px] uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2 shrink-0">
                  <span className="material-symbols-outlined text-base">history</span>
                  {tLiveChrome('keyEvents') ?? 'Key Events'}
                </h3>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <MatchKeyEvents
                    events={keyEvents}
                    rosterById={rosterByIdForKeys}
                    currentMinute={currentMinute}
                    homeTeamId={homeTeamId ?? null}
                    awayTeamId={awayTeamId ?? null}
                  />
                </div>
              </div>

              {/* Lane Stats Summary */}
              {stats?.homeTeamStats?.laneStrengthAverages && stats?.awayTeamStats?.laneStrengthAverages && (
                <StatsResult
                  homeLaneStrength={stats.homeTeamStats.laneStrengthAverages}
                  awayLaneStrength={stats.awayTeamStats.laneStrengthAverages}
                  homeTeamName={homeName}
                  awayTeamName={awayName}
                  homePossessionPct={stats.homeTeamStats.possessionPercentage}
                  awayPossessionPct={stats.awayTeamStats.possessionPercentage}
                  homeShots={stats.homeTeamStats.shots}
                  awayShots={stats.awayTeamStats.shots}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
