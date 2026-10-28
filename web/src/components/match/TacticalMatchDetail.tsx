'use client';

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  api,
  MAX_FORECAST_DAYS,
  MATCH_STATUS,
  type MatchEvent,
  type MatchStatsRes,
  type Player,
  type Tactics,
  type WeatherForecastEntry,
  type WeatherForecastRes,
  type WeatherType,
} from '@/lib/api';
import { MatchPitch, type MatchSnapshot } from './MatchPitch';
import { MatchPitchStage } from './MatchPitchStage';
import type { PitchMarkerMode } from './MatchPlayerMarker';
import { SubbedOffStrip, type SubbedOffPlayer } from './SubbedOffStrip';
import { subbedOffFrom } from './subbed-off';
import { MatchProgressRail } from './MatchProgressRail';
import { MatchPage } from './MatchPage';
import { LiveCommentary } from './LiveCommentary';
import { extractSnapshots } from './snapshot-stats';
import { normalizePitchLineup } from './pitch-coords';
import { MatchInfoPanel } from './MatchInfoPanel';
import { KeyEventsToggle, MatchKeyEvents } from './MatchKeyEvents';
import { StatsResult } from './StatsResult';
import { MatchStatsSummary } from './MatchStatsSummary';
import { extractSidebarData } from './match-sidebar-data';
import { MatchScoreHero } from './bento/MatchScoreHero';
import { closestSnapshotIndex } from './match-timeline';
import { getCompletionInfo, type CompletionInfo } from './match-completion';
import { playerIdsToHighlight } from './involved-players';
import { buildChanceBreakdown } from './chance-breakdown';
import { ChanceDistribution } from './ChanceDistribution';

interface TacticalMatchDetailProps {
  matchId: string;
  match: {
    /** `league | cup | playoff | tournament | friendly | national_team` —
     *  drives the competition label in the info card. */
    type?: string | null;
    /** Competition row id — the info card's title links to it. */
    leagueId?: string | null;
    /** Cup bracket id, for the title link on cup ties. */
    cupId?: string | null;
    leagueName?: string | null;
    /** Season number, rendered next to the matchday in the info card. */
    season?: number | null;
    /** League matchday, rendered as "Matchday N" in the info card. */
    round?: number | null;
    /** Cup round, rendered as "Round N" for `type === 'cup'`. */
    cupRound?: number | null;
    /** Venue capacity — the denominator of the attendance fill percentage. */
    capacity?: number | null;
    /** Gate receipts (home fixtures only). */
    ticketRevenue?: number | null;
    /** The venue stadium's own id — the venue link target. */
    stadiumId?: string | null;
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
  /**
   * Current wall-clock time in ms, supplied by the page. The forecast window
   * (`daysUntilMatch`) used to call `Date.now()` during render, which React
   * flags as an impure render and which made the window freeze at the value
   * captured by the first render. The page already ticks a 30s clock for the
   * tactics lock countdown, so pass that clock down instead.
   */
  now: number;
}


/** Maps a weather type to the Material ligature name shown in the
 * pre-match card (resolved to an SVG by <AppIcon>). */
function weatherIconName(w: WeatherType | string): MaterialIconName {
  const key = w.toLowerCase();
  if (key.includes('storm')) return 'thunderstorm';
  if (key.includes('rain')) return 'rainy';
  if (key.includes('snow')) return 'ac_unit';
  if (key.includes('fog')) return 'foggy';
  if (key.includes('wind')) return 'air';
  if (key.includes('cloud')) return 'cloud';
  return 'wb_sunny';
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
  currentMinute,
  now,
}: TacticalMatchDetailProps) {
  const locale = useLocale();
  const homeName = match.homeTeam?.name || 'Home';
  const awayName = match.awayTeam?.name || 'Away';
  const isLive = match.status === MATCH_STATUS.IN_PROGRESS;
  // Matches that haven't started yet (SCHEDULED, PENDING, etc.) have no
  // events, no snapshots and no per-team stats. Showing the pitch / bench
  // / commentary / lane stats would be misleading, so we collapse the page
  // to just the score header and a small pre-match card.
  const isCompleted = match.status === MATCH_STATUS.COMPLETED;
  const isPreMatch = !isLive && !isCompleted;
  // Derive the minute the report-mode chrome should show. See
  // `getReportCurrentMinute` for the rationale (was hard-coded 90;
  // broke forfeit/extra-time cases).
  //
  // The fallback is `currentMinute === undefined`, not `?? currentMinute`:
  // the prop used to default to 90, which made the derivation dead code and
  // left every 120-minute cup tie (and every forfeit that stopped early)
  // showing "90'" in the commentary header and the progress rail.
  const reportCurrentMinute = useMemo(
    () => (currentMinute != null ? currentMinute : getReportCurrentMinute(events)),
    [currentMinute, events],
  );
  const [pitchMode, setPitchMode] = useState<PitchMarkerMode>('lineup');
  // Compact list by default; the toggle reveals the chances that missed.
  const [showChances, setShowChances] = useState(false);
  // Cross-panel selection: a glyph in the strip or a row in the key-events
  // column picks one event, and the commentary feed highlights that sentence.
  // The three panels describe the same fixture, so a click in one should not
  // leave the reader hunting for the matching line in the other.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  /**
   * The players the selected line is about, drawn on the pitch. A goal lights
   * the scorer and the assister, a turnover the interceptor, a card the booked
   * player — see `involved-players.ts` for the rule.
   */
  const highlightedPlayerIds = useMemo(
    () => playerIdsToHighlight(events, selectedEventId),
    [events, selectedEventId],
  );
  // Chances-by-lane card: derived from the event stream, so it works on
  // the report and the (already completed) live handoff alike.
  const chanceBreakdown = useMemo(
    () => buildChanceBreakdown(events, match.homeTeam?.id ?? null, match.awayTeam?.id ?? null),
    [events, match.homeTeam?.id, match.awayTeam?.id],
  );
  const homeTeamId = match.homeTeam?.id;
  const awayTeamId = match.awayTeam?.id;
  const tLiveChrome = useTranslations('matches.live');
  const tChip = useTranslations('matches.bento.pitchChip');

  const allSnapshots = useMemo(() => extractSnapshots(events), [events]);
  // B9: was `getLatestSnapshot(events)`, a hand-rolled sibling of
  // `extractSnapshots` that re-walked the event list and re-shaped
  //
  // The index is clamped at render time instead of in an effect: the effect
  // version called `setState` synchronously on every snapshot-count change
  // (a cascading render the `set-state-in-effect` rule rejects), and the
  // clamp is pure anyway — the slider at the bottom of the page is the only
  // writer, and it always passes an in-range index.
  const lastSnapshotIndex = Math.max(0, allSnapshots.length - 1);
  // A finished match opens on the kickoff snapshot: the report is something
  // you read from the beginning, and parking the pitch — and the progress
  // strip — on the final frame made every page load look like a live match
  // that had just ended. Live matches still follow the latest snapshot.
  const [activeSnapshotIndex, setActiveSnapshotIndex] = useState<number>(() =>
    isCompleted ? 0 : lastSnapshotIndex,
  );
  const clampedSnapshotIndex = Math.min(activeSnapshotIndex, lastSnapshotIndex);
  const activeSnapshot: MatchSnapshot | null =
    allSnapshots[clampedSnapshotIndex] ?? null;

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
  //
  // The result is keyed by the forecast date and read through that key rather
  // than cleared in the effect: clearing it synchronously (`setForecast(null)`
  // when the window closes) is exactly the cascading-render pattern the
  // `set-state-in-effect` rule rejects, and a stale-date payload simply fails
  // the key match on the next render.
  const daysUntilMatch = useMemo(() => {
    if (!match.scheduledAt) return 0;
    const ms = new Date(match.scheduledAt).getTime() - now;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }, [match.scheduledAt, now]);
  const isForecastAvailable =
    isPreMatch && daysUntilMatch > 0 && daysUntilMatch <= MAX_FORECAST_DAYS;
  const forecastDate =
    isForecastAvailable && match.scheduledAt
      ? new Date(match.scheduledAt).toISOString().slice(0, 10)
      :  null;
  const [forecastState, setForecastState] = useState<{
    date: string;
    res: WeatherForecastRes | null;
  } | null>(null);
  const forecast =
    forecastDate && forecastState?.date === forecastDate
      ? forecastState.res
      :  null;
  useEffect(() => {
    if (!forecastDate) return;
    let cancelled = false;
    api.weather
      .getForecast(forecastDate)
      .then((res) => {
        if (!cancelled) setForecastState({ date: forecastDate, res });
      })
      .catch(() => {
        // Non-fatal — the UI falls back to a "TBD" label.
        if (!cancelled) setForecastState({ date: forecastDate, res: null });
      });
    return () => {
      cancelled = true;
    };
  }, [forecastDate]);

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

  // Prefer the denormalised match fields — the scheduler and simulator are
  // the single source of truth. Only fall back to the legacy
  // `weather_announcement` event payload if those are missing (older rows
  // before this column was added, or corrupted data).
  const { weather: eventWeather, attendance: eventAttendance } =
    useMemo(() => extractSidebarData(events), [events]);
  const resolvedWeather: WeatherType | string | null =
    match.weather ?? eventWeather;
  const resolvedAttendance: number | null =
    match.attendance ?? eventAttendance;
  const resolvedVenue: string | null = match.venue ??  null;

  // Pre-match chrome: a scheduled fixture has no live minute to show, and a
  // cancelled one has nothing to count. Both used to render "90' CONNECTING…"
  // in the hero because the component only knew the live / FT dichotomy.
  // Finished knockout ties swap "FT" for "AET" / "PENS" — see
  // `getCompletionInfo`. A shootout additionally overwrites the stored score
  // with the spot-kick tally (deliberate: standings / ELO bookkeeping needs a
  // decisive scoreline), so the hero is fed the football result from the
  // closing `full_time` event and the shootout numbers move into the chip.
  const completion: CompletionInfo = isCompleted
    ? getCompletionInfo(events)
    : { marker: null, finalScore: null, penaltyScore: null };
  const completionMarker = completion.marker;
  const shootoutScore =
    completionMarker === 'shootout' ? completion.penaltyScore :  null;
  const footballScore =
    shootoutScore ? completion.finalScore :  null;

  const heroStatusLabel =
    match.status === MATCH_STATUS.CANCELLED
      ? tLiveChrome('cancelled')
      : isPreMatch
        ? match.scheduledAt
          ? new Date(match.scheduledAt).toLocaleString(locale, {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })
          : tLiveChrome('notStartedTitle')
        : completionMarker === 'shootout'
          ? tLiveChrome('penaltyShootout')
          : completionMarker === 'extraTime'
            ? tLiveChrome('afterExtraTime')
            : undefined;

  // Only the kickoff-time label gets the "Kickoff" caption; "Cancelled" and
  // the completion markers are self-describing (the shootout one carries the
  // spot-kick scoreline, which the hero's `FT`/`PENS` value can't).
  const heroStatusHint =
    shootoutScore
      ? `${shootoutScore.home}–${shootoutScore.away}`
      : isPreMatch && match.status !== MATCH_STATUS.CANCELLED
        ? tLiveChrome('scheduledFor')
        : undefined;

  const hero = (
    <MatchScoreHero
      locale={locale}
      matchId={matchId}
      homeTeamName={homeName}
      awayTeamName={awayName}
      homeScore={footballScore ? footballScore.home : (match.homeScore ?? 0)}
      awayScore={footballScore ? footballScore.away : (match.awayScore ?? 0)}
      currentMinute={reportCurrentMinute}
      isComplete={isCompleted}
      isConnected={false}
      statusLabel={heroStatusLabel}
      statusHint={heroStatusHint}
    />
  );

  // Pre-match: no events, snapshots or stats yet. Show the empty pitch plus a
  // right rail with the venue, kickoff time and the weather forecast. The
  // timeline, bench, commentary and lane stats stay hidden because there is no
  // data behind them.
  if (isPreMatch) {
    return (
      <MatchPage
        mode="report"
        hero={hero}
        main={
          <div className="w-full">
            <MatchPitch
              homeTactics={null}
              awayTactics={null}
              homeRoster={[]}
              awayRoster={[]}
              activeSnapshot={null}
              mode="lineup"
              homeForfeit={false}
              awayForfeit={false}
              homeTeamName={homeName}
              awayTeamName={awayName}
            />
          </div>
        }
        aside={
          <>
            <div className="glass-panel rounded-2xl p-4">
              <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
                <AppIcon name="stadium" className="text-base" />
                {tLiveChrome('matchInfo') ?? 'Match Info'}
              </h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <AppIcon name="place" className="text-on-surface/40 text-sm" />
                  <span className="font-headline font-bold text-sm text-on-surface/90">
                    {resolvedVenue ?? tLiveChrome('venueTbd') ?? 'Venue TBD'}
                  </span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base">
                      <AppIcon
                        name={
                          match.weather
                            ? weatherIconName(match.weather)
                            : forecast?.forecasts?.[0]
                              ? weatherIconName(forecast.forecasts[0].weather)
                              : 'help_outline'
                        }
                      />
                    </span>
                    <span className="font-headline font-bold text-sm text-on-surface/90">
                      {tLiveChrome('weatherForecastLabel') ?? 'Forecast'}:{' '}
                      {match.weather ? (
                        <span className="capitalize">
                          {String(match.weather).replace('_', ' ')}
                        </span>
                      ) : daysUntilMatch > MAX_FORECAST_DAYS ? (
                        <span className="text-on-surface/60 font-normal">
                          {tLiveChrome('weatherForecastOutOfRange') ??
                            `Out of range (>${MAX_FORECAST_DAYS} days)`}
                        </span>
                      ) : forecast?.forecasts?.[0] ? (
                        <span className="capitalize">
                          {forecast.forecasts[0].weather.replace('_', ' ')}{' '}
                          <span className="text-on-surface/50 font-normal">
                            ({forecast.forecasts[0].probability}%)
                          </span>
                        </span>
                      ) : (
                        <span className="text-on-surface/60 font-normal">
                          {tLiveChrome('weatherForecastTbd') ??
                            'Decided at kickoff'}
                        </span>
                      )}
                    </span>
                  </div>
                  {forecast &&
                    forecast.source !== 'out_of_range' &&
                    forecast.forecasts.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 pl-6">
                        {forecast.forecasts.slice(1).map((f: WeatherForecastEntry) => (
                          <span
                            key={f.weather}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container text-kicker font-label text-on-surface/60"
                          >
                            <AppIcon name={weatherIconName(f.weather)} />
                            <span className="capitalize">
                              {f.weather.replace('_', ' ')}
                            </span>
                            <span className="text-on-surface/40">{f.probability}%</span>
                          </span>
                        ))}
                      </div>
                    )}
                </div>
                {match.scheduledAt && (
                  <div className="flex items-center gap-2">
                    <AppIcon name="schedule" className="text-on-surface/40 text-sm" />
                    <span className="font-headline font-bold text-sm text-on-surface/90">
                      {tLiveChrome('scheduledFor') ?? 'Kickoff'}:{' '}
                      {new Date(match.scheduledAt).toLocaleString()}
                    </span>
                  </div>
                )}
                {match.status === MATCH_STATUS.CANCELLED && (
                  <p className="text-kicker font-label text-error uppercase tracking-widest mt-1">
                    {tLiveChrome('cancelled') ?? 'Cancelled'}
                  </p>
                )}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 flex flex-col items-center text-center gap-2">
              <AppIcon name="event" className="text-3xl text-primary/40" />
              <p className="text-xs text-on-surface-variant font-headline">
                {tLiveChrome('notStartedBody') ??
                  'Lineups, live stats and the event timeline will appear here once the match kicks off.'}
              </p>
            </div>
          </>
        }
      />
    );
  }

  return (
    <MatchPage
      mode="report"
      hero={hero}
      main={
        <div className="space-y-3">
          <div className="w-full">
            <MatchPitchStage
              clock="FT"
              mode={pitchMode}
              onModeChange={setPitchMode}
              progress={
                <MatchProgressRail
                  events={events}
                  currentMinute={reportCurrentMinute}
                  selectedMinute={allSnapshots[clampedSnapshotIndex]?.minute}
                  selectedEventId={selectedEventId}
                  onSelectEvent={setSelectedEventId}
                  onSelectMinute={(minute) =>
                    setActiveSnapshotIndex(closestSnapshotIndex(allSnapshots, minute))
                  }
                />
              }
              footer={<SubbedOffStrip players={subbedOffFrom(events, match.homeTeam?.id)} />}
            >
              <MatchPitch
                homeTactics={homeTactics}
                awayTactics={awayTactics}
                homeRoster={homeRoster}
                awayRoster={awayRoster}
                activeSnapshot={activeSnapshot}
                mode={pitchMode}
                homeForfeit={match.homeForfeit ?? false}
                awayForfeit={match.awayForfeit ?? false}
                homeTeamName={homeName}
                awayTeamName={awayName}
                highlightedPlayerIds={highlightedPlayerIds}
              />
            </MatchPitchStage>
          </div>
        </div>
      }
      timeline={null}
      commentary={
        <LiveCommentary
          events={events}
          currentMinute={reportCurrentMinute}
          homeTeamName={homeName}
          awayTeamName={awayName}
          homeTeamId={match.homeTeam?.id ?? null}
          awayTeamId={match.awayTeam?.id ?? null}
          homeScore={footballScore ? footballScore.home : (match.homeScore ?? 0)}
          awayScore={footballScore ? footballScore.away : (match.awayScore ?? 0)}
          mode="replay"
          selectedEventId={selectedEventId}
          onSelectEvent={setSelectedEventId}
        />
      }
      aside={
        <>
          <div className="glass-panel rounded-2xl p-4 shrink-0">
            <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2">
              <AppIcon name="stadium" className="text-base" />
              {tLiveChrome('matchInfo') ?? 'Match Info'}
            </h3>
            <MatchInfoPanel
              match={{
                ...match,
                // The panel reads the *resolved* match-day context, not the
                // raw columns: `Match.weather` is only written when the
                // preprocess scheduler found a `weather` row for the fixture
                // date, so on most fixtures it is still null while the
                // simulator did announce one (`weather_announcement`). The
                // resolved values are derived above and already used by the
                // pre-match card, so reuse them here instead of keeping a
                // second, weaker resolution path.
                weather: resolvedWeather,
                attendance: resolvedAttendance,
                venue: resolvedVenue,
              }}
            />
          </div>

          <div className="glass-panel rounded-2xl p-4 flex flex-col min-h-[200px] max-h-[420px]">
            <h3 className="font-headline font-bold text-kicker uppercase tracking-widest text-primary/80 mb-3 flex items-center gap-2 shrink-0">
              <AppIcon name="history" className="text-base" />
              {tLiveChrome('keyEvents') ?? 'Key Events'}
              <KeyEventsToggle
                detailed={showChances}
                onToggle={() => setShowChances((v) => !v)}
                label={showChances ? tLiveChrome('highlightsOnly') : tLiveChrome('showChances')}
              />
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <MatchKeyEvents
                events={events}
                rosterById={rosterByIdForKeys}
                currentMinute={reportCurrentMinute}
                homeTeamId={homeTeamId ?? null}
                awayTeamId={awayTeamId ?? null}
                detailed={showChances}
                selectedEventId={selectedEventId}
                onSelectEvent={setSelectedEventId}
              />
            </div>
          </div>

          <MatchStatsSummary
            stats={stats ?? null}
            events={events}
            homeTeamName={homeName}
            awayTeamName={awayName}
            homeTeamId={match.homeTeam?.id ?? null}
            awayTeamId={match.awayTeam?.id ?? null}
          />

          {stats?.homeTeamStats?.laneStrengthAverages &&
            stats?.awayTeamStats?.laneStrengthAverages && (
              <StatsResult
                homeLaneStrength={stats.homeTeamStats.laneStrengthAverages}
                awayLaneStrength={stats.awayTeamStats.laneStrengthAverages}
                homeTeamName={homeName}
                awayTeamName={awayName}
              />
            )}

          <ChanceDistribution
            breakdown={chanceBreakdown}
            homeTeamName={homeName}
            awayTeamName={awayName}
          />
        </>
      }
    />
  );
}
