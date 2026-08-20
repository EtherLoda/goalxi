import { MatchEntity, MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { MatchCacheService } from './match-cache.service';
import { computeCurrentInGameMinute } from './match-current-minute';
import { MatchLiveGateway } from './match-live.gateway';

// 比赛开始前5分钟可见首发阵容
const LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES = 5;

/**
 * Aggregated per-match cumulative score for the `processRevealableEvents`
 * tick. Sourced from a single `GROUP BY matchId` query so the scheduler
 * can broadcast the *cumulative* score (not the batch-delta), which is
 * what the client expects. `currentMinute` used to live here too but
 * has been moved to `computeCurrentInGameMinute` (wall-clock anchored
 * to the sim's published `eventScheduledTime` mapping) — see
 * `match-current-minute.ts`.
 */
interface CumulativeMatchStats {
  homeScore: number;
  awayScore: number;
  maxMinute: number;
}

@Injectable()
export class MatchLiveScheduler {
  private readonly logger = new Logger(MatchLiveScheduler.name);

  constructor(
    @InjectRepository(MatchEventEntity)
    private eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(MatchEntity)
    private matchRepository: Repository<MatchEntity>,
    private matchLiveGateway: MatchLiveGateway,
    private matchCacheService: MatchCacheService,
  ) {}

  // Run every 5 seconds to check for events that need to be revealed
  @Cron('*/5 * * * * *')
  async processRevealableEvents() {
    const now = new Date();

    // Find events that are ready to be revealed (eventScheduledTime has passed).
    // No `relations` — the only thing this tick does with the rows is forward
    // them as `match_events` payloads to the gateway, which never reads the
    // joined `match` / `team` / `player` columns. Dropping the three joins
    // cuts a measurable chunk of work on hot sim-weekend nights when the
    // per-tick batch is 100s of rows across many matches.
    const eventsToReveal = await this.eventRepository.find({
      where: {
        isRevealed: false,
        eventScheduledTime: LessThanOrEqual(now),
      },
    });

    if (eventsToReveal.length === 0) {
      return;
    }

    this.logger.debug(
      `[MatchLive] Found ${eventsToReveal.length} events to reveal`,
    );

    // Group events by match
    const byMatch = new Map<string, MatchEventEntity[]>();
    for (const event of eventsToReveal) {
      if (!byMatch.has(event.matchId)) {
        byMatch.set(event.matchId, []);
      }
      byMatch.get(event.matchId)!.push(event);
    }

    // Aggregate per-match cumulative goal count + max minute in a single
    // GROUP BY query. This is the load-bearing fix for the score-update
    // bug: the old code computed the score from `events` (i.e. the *batch
    // delta*), so on the second goal the broadcast would say 1-0 and
    // overwrite the client-side 2-0 the prior tick had set. The client
    // hook (`useMatchPage` → `setMatchState`) overwrites `homeScore`/
    // `awayScore` verbatim, so any batch-delta broadcast would visibly
    // rewind the scoreline as more goals landed. Pulling the cumulative
    // count from the DB once per match per tick keeps the contract
    // monotonic by construction.
    const cumulativeByMatch = await this.getCumulativeMatchStats(
      Array.from(byMatch.keys()),
    );

    // Fetch the match timing fields for each match we're about to
    // broadcast for. We need `scheduledAt` + per-half injury times
    // to compute the wall-clock-anchored `currentMinute` — see
    // `match-current-minute.ts` for the formula. One IN-list query
    // here is cheaper than N point lookups inside the loop.
    const matchIds = Array.from(byMatch.keys());
    const matchEntities = await this.matchRepository.find({
      where: { id: In(matchIds) },
      select: [
        'id',
        'scheduledAt',
        'firstHalfInjuryTime',
        'secondHalfInjuryTime',
        'hasExtraTime',
        'extraTimeFirstHalfInjury',
        'extraTimeSecondHalfInjury',
      ],
    });
    const matchById = new Map(matchEntities.map((m) => [m.id, m]));

    // Process each match
    for (const [matchId, events] of byMatch.entries()) {
      try {
        const stats: CumulativeMatchStats = cumulativeByMatch.get(matchId) ?? {
          homeScore: 0,
          awayScore: 0,
          maxMinute: 0,
        };
        const match = matchById.get(matchId);
        if (!match) {
          this.logger.warn(
            `[MatchLive] Skipping ${matchId}: match row missing in DB`,
          );
          continue;
        }
        await this.processMatchEvents(match, events, stats);
      } catch (error) {
        this.logger.error(
          `[MatchLive] Error processing match ${matchId}: ${error.message}`,
        );
      }
    }

    // Mark events as revealed
    const eventIds = eventsToReveal.map((e) => e.id);
    if (eventIds.length > 0) {
      await this.eventRepository.update(
        { id: In(eventIds) },
        { isRevealed: true },
      );
      // Invalidate the per-match event cache so the next `getMatchEvents`
      // (REST or gateway `getVisibleEvents`) re-reads from the DB and
      // picks up the newly-revealed events. Without this, the cache's
      // 24h TTL would keep the stale `isRevealed=false` payload
      // serving until process restart or explicit manual invalidation,
      // and live clients would never see the new event until then.
      for (const matchId of byMatch.keys()) {
        await this.matchCacheService.invalidateMatchCache(matchId);
      }
    }
  }

  // Check for matches that need lineup broadcasting (5 min before kickoff)
  @Cron('*/30 * * * * *')
  async processLineupBroadcasts() {
    const now = new Date();
    const lineupCutoff = new Date(
      now.getTime() + LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES * 60 * 1000,
    );

    // Find matches that are about to start (within 5 min) AND have not
    // already had their lineup broadcast. The `lineup_broadcast_at IS NULL`
    // filter is the load-bearing one for B5: without it, this 30s cron
    // tick would re-broadcast the same lineup every 30s for the entire
    // 5-minute pre-kickoff window, and every subscribed client would
    // overwrite its in-memory `lineup` state on each tick.
    const upcomingMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThanOrEqual(lineupCutoff),
        lineupBroadcastAt: IsNull(),
      },
      relations: ['homeTeam', 'awayTeam'],
    });

    for (const match of upcomingMatches) {
      try {
        // Only broadcast if within exact window (within 5 min)
        const minutesBeforeKickoff =
          (new Date(match.scheduledAt).getTime() - now.getTime()) / (60 * 1000);

        if (
          minutesBeforeKickoff > 0 &&
          minutesBeforeKickoff <= LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES
        ) {
          // Events include kickoff events with player info.
          // The repository now filters at SQL level: pulling every event for
          // a 90-minute match just to filter for `kickoff` is wasteful when
          // we already have a (matchId, phase, minute) composite index.
          const kickoffEvents = await this.eventRepository.find({
            where: { matchId: match.id, typeName: 'kickoff' },
          });

          // Send lineup to subscribed clients
          this.matchLiveGateway.broadcastLineup(match.id, {
            homeTeam: {
              id: match.homeTeamId,
              name: match.homeTeam?.name,
              logo: (match.homeTeam as any)?.logoUrl,
            },
            awayTeam: {
              id: match.awayTeamId,
              name: match.awayTeam?.name,
              logo: (match.awayTeam as any)?.logoUrl,
            },
            scheduledAt: match.scheduledAt,
            events: kickoffEvents.map((e) => ({
              minute: e.minute,
              phase: e.phase,
              isHome: e.isHome,
              data: e.data,
            })),
          });

          // Mark broadcast before we exit so a re-tick within the window
          // (or a parallel scheduler instance) can't double-send. Doing
          // this *after* the broadcast is intentional: a crash mid-broadcast
          // would just mean a future re-attempt finds the row still
          // null and re-broadcasts once, which the client already
          // treats as idempotent (same key tuple dedupes in the hook).
          await this.matchRepository.update(
            { id: match.id },
            { lineupBroadcastAt: new Date() },
          );

          this.logger.debug(
            `[MatchLive] Broadcasted lineup for match ${match.id} (${minutesBeforeKickoff.toFixed(1)} min before kickoff)`,
          );
        }
      } catch (error) {
        this.logger.error(
          `[MatchLive] Error broadcasting lineup for match ${match.id}: ${error.message}`,
        );
      }
    }
  }

  // Check for matches that have ended and broadcast completion
  @Cron('*/10 * * * * *')
  async processMatchCompletions() {
    const now = new Date();

    // Find matches that have ended but have NOT yet had their `match_end`
    // event broadcast. The `match_end_broadcast_at IS NULL` filter is the
    // load-bearing one for B4: without it, this 10s cron tick would
    // re-broadcast `match_end` for every `COMPLETED` match forever (the
    // status is permanent), and the client `useMatchPage` hook would
    // re-run `setMode('report')` + reset `matchState` on every tick.
    // The IN_PROGRESS branch handles the in-flight race where a match
    // hits its `actualEndTime` between two ticks; with the marker set
    // after the broadcast, only the first tick can win the broadcast.
    const completedMatches = await this.matchRepository.find({
      where: [
        { status: MatchStatus.COMPLETED, matchEndBroadcastAt: IsNull() },
        {
          status: MatchStatus.IN_PROGRESS,
          actualEndTime: LessThanOrEqual(now),
          matchEndBroadcastAt: IsNull(),
        },
      ],
      relations: ['homeTeam', 'awayTeam'],
    });

    for (const match of completedMatches) {
      try {
        // Broadcast match end
        this.matchLiveGateway.broadcastMatchEnd(
          match.id,
          match.homeScore || 0,
          match.awayScore || 0,
          true,
        );

        // Mark broadcast. Same rationale as the lineup branch above:
        // doing this *after* the broadcast means a crash mid-broadcast
        // gets a clean retry on the next tick (the row stays null).
        await this.matchRepository.update(
          { id: match.id },
          { matchEndBroadcastAt: new Date() },
        );

        this.logger.debug(`[MatchLive] Broadcasted match end for ${match.id}`);
      } catch (error) {
        this.logger.error(
          `[MatchLive] Error broadcasting match end for ${match.id}: ${error.message}`,
        );
      }
    }
  }

  private async processMatchEvents(
    match: MatchEntity,
    events: MatchEventEntity[],
    cumulative: CumulativeMatchStats,
  ) {
    const matchId = match.id;

    // Broadcast the freshly-revealed events to the room. Score / minute
    // come from the *cumulative* GROUP BY result so the value broadcast
    // is monotonic with the previous tick — see the load-bearing comment
    // on `getCumulativeMatchStats` above.
    const eventPayloads = events.map((e) => ({
      type: e.typeName || String(e.type),
      matchId: e.matchId,
      minute: e.minute,
      teamId: e.teamId,
      playerId: e.playerId,
      playerName: (e.data as any)?.playerName,
      data: e.data,
      eventScheduledTime: e.eventScheduledTime?.getTime(),
      id: e.id,
      isHome: e.isHome ?? undefined,
    }));

    this.matchLiveGateway.broadcastEvents(matchId, eventPayloads);

    // The current minute is anchored to wall-clock, not to the
    // event stream. The sim publishes per-event `eventScheduledTime`
    // values that already encode the half-time break + per-half
    // injury time; we invert that mapping here so the on-screen
    // minute keeps advancing in the gaps between event reveals
    // (e.g. 91..93 during 2H injury time used to be stuck at 90
    // because MAX(minute) of the reveal-sparse injury band only
    // ticked forward one event at a time). The broadcast is
    // safe to send every tick: homeScore / awayScore come from
    // the DB (cumulative, never decreases), so the client's
    // `setMatchState` overwrite is idempotent. Only the
    // currentMinute changes monotonically per tick.
    const currentMinute = computeCurrentInGameMinute(match);
    this.matchLiveGateway.broadcastScoreUpdate(
      matchId,
      cumulative.homeScore,
      cumulative.awayScore,
      currentMinute,
    );

    this.logger.debug(
      `[MatchLive] Broadcasted ${events.length} events for match ${matchId} (${cumulative.homeScore}-${cumulative.awayScore} at ${currentMinute}')`,
    );
  }

  /**
   * One row per matchId, summarizing all *currently revealed* goal
   * events for that match plus the max minute seen. Drives the
   * cumulative score broadcast so the client never sees a rewind.
   *
   * One aggregate query for the whole tick (not N queries) — N matches
   * with revealed goals produces one `GROUP BY match_id` round-trip
   * which PostgreSQL executes against the existing
   * `(matchId, phase, minute)` composite index.
   *
   * Returns an empty Map if `matchIds` is empty so the caller can stay
   * linear without a guard.
   */
  private async getCumulativeMatchStats(
    matchIds: string[],
  ): Promise<Map<string, CumulativeMatchStats>> {
    const result = new Map<string, CumulativeMatchStats>();
    if (matchIds.length === 0) {
      return result;
    }

    // We only pull goal counts here — `currentMinute` is now derived
    // from wall-clock via `computeCurrentInGameMinute` in the per-match
    // broadcast path, so the `MAX(minute)` column was dropped.
    const rows = await this.eventRepository
      .createQueryBuilder('e')
      .select('e.matchId', 'matchId')
      .addSelect(
        `COUNT(*) FILTER (WHERE e.typeName IN ('goal', 'penalty_goal') AND e.isHome = true)`,
        'homeGoals',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE e.typeName IN ('goal', 'penalty_goal') AND e.isHome = false)`,
        'awayGoals',
      )
      .where('e.isRevealed = :revealed', { revealed: true })
      .andWhere('e.matchId IN (:...matchIds)', { matchIds })
      .groupBy('e.matchId')
      .getRawMany<{
        matchId: string;
        homeGoals: string;
        awayGoals: string;
      }>();

    for (const r of rows) {
      result.set(r.matchId, {
        homeScore: Number(r.homeGoals) || 0,
        awayScore: Number(r.awayGoals) || 0,
        maxMinute: 0,
      });
    }
    return result;
  }
}
