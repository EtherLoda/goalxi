import { MatchEntity, MatchEventEntity, MatchStatus } from '@goalxi/database';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
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
    }
  }

  // Check for matches that need lineup broadcasting (5 min before kickoff)
  @Cron('*/30 * * * * *')
  async processLineupBroadcasts() {
    const now = new Date();
    const lineupCutoff = new Date(
      now.getTime() + LINEUP_VISIBLE_BEFORE_KICKOFF_MINUTES * 60 * 1000,
    );

    // Find matches that are about to start (within 5 min)
    const upcomingMatches = await this.matchRepository.find({
      where: {
        status: MatchStatus.TACTICS_LOCKED,
        scheduledAt: LessThanOrEqual(lineupCutoff),
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
          // Get tactics (lineup) for both teams
          const matchEvents = await this.eventRepository.find({
            where: { matchId: match.id },
            order: { createdAt: 'ASC' },
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
            // Events include kickoff events with player info
            events: matchEvents
              .filter((e) => e.typeName === 'kickoff')
              .map((e) => ({
                minute: e.minute,
                phase: e.phase,
                isHome: e.isHome,
                data: e.data,
              })),
          });

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

    // Find matches that have ended (status = COMPLETED or simulation completed but not yet processing)
    const completedMatches = await this.matchRepository.find({
      where: [
        { status: MatchStatus.COMPLETED },
        {
          status: MatchStatus.IN_PROGRESS,
          actualEndTime: LessThanOrEqual(now),
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
