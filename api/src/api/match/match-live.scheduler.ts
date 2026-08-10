import { MatchEntity, MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { MatchCacheService } from './match-cache.service';
import { MatchLiveGateway } from './match-live.gateway';

// 比赛开始前5分钟可见首发阵容
const LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES = 5;

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

    // Find events that are ready to be revealed (eventScheduledTime has passed)
    const eventsToReveal = await this.eventRepository.find({
      where: {
        isRevealed: false,
        eventScheduledTime: LessThanOrEqual(now),
      },
      relations: ['match', 'team', 'player'],
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

    // Process each match
    for (const [matchId, events] of byMatch.entries()) {
      try {
        await this.processMatchEvents(matchId, events);
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
    matchId: string,
    events: MatchEventEntity[],
  ) {
    // Calculate current score from events
    let homeScore = 0;
    let awayScore = 0;
    let currentMinute = 0;

    const match = events[0]?.match;
    if (!match) return;

    for (const event of events) {
      // Track current minute (max minute seen)
      if (event.minute > currentMinute) {
        currentMinute = event.minute;
      }

      // Count goals
      if (event.typeName === 'goal' || event.typeName === 'penalty_goal') {
        if (event.isHome) {
          homeScore++;
        } else {
          awayScore++;
        }
      }
    }

    // Broadcast events
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

    // If score changed, broadcast score update
    if (homeScore > 0 || awayScore > 0) {
      this.matchLiveGateway.broadcastScoreUpdate(
        matchId,
        homeScore,
        awayScore,
        currentMinute,
      );
    }

    this.logger.debug(
      `[MatchLive] Broadcasted ${events.length} events for match ${matchId} (${homeScore}-${awayScore} at ${currentMinute}')`,
    );
  }
}
