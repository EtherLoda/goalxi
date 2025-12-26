import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    TeamEntity,
    GAME_SETTINGS,
    MatchStatus,
} from '@goalxi/database';
import { MatchCacheService } from './match-cache.service';

// MatchEventType enum (matches simulator/src/engine/types.ts)
enum MatchEventType {
    GOAL = 2,
    FORFEIT = 20,
}

export interface MatchEventsResponse {
    matchId: string;
    homeTeam: {
        id: string;
        name: string;
        logo: string | null;
    };
    awayTeam: {
        id: string;
        name: string;
        logo: string | null;
    };
    scheduledAt: Date;
    currentMinute: number;
    totalMinutes: number;
    isComplete: boolean;
    events: MatchEventEntity[];
    currentScore: {
        home: number;
        away: number;
    };
    stats: {
        home: MatchTeamStatsEntity;
        away: MatchTeamStatsEntity;
    } | null;
}

@Injectable()
export class MatchEventService {
    constructor(
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchEventEntity)
        private eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(MatchTeamStatsEntity)
        private statsRepository: Repository<MatchTeamStatsEntity>,
        @InjectRepository(TeamEntity)
        private teamRepository: Repository<TeamEntity>,
        private matchCacheService: MatchCacheService,
    ) { }

    async getMatchEvents(
        matchId: string,
        userId?: string,
    ): Promise<MatchEventsResponse> {
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!match) {
            throw new NotFoundException('Match not found');
        }

        // Authorization check - Currently disabled to allow public access
        // All users (logged-in or not) can view all match events
        // Future: Re-enable for private matches if needed
        // if (userId) {
        //     await this.validateAccess(userId, match);
        // }


        // Get streaming speed from settings
        const streamingSpeed = GAME_SETTINGS.MATCH_STREAMING_SPEED;
        const totalMinutes =
            90 +
            (match.firstHalfInjuryTime || 0) +
            (match.secondHalfInjuryTime || 0) +
            (match.hasExtraTime ? 30 : 0);

        let maxVisibleMinute = 0;

        if (match.status === MatchStatus.COMPLETED) {
            maxVisibleMinute = totalMinutes + 10;
        } else {
            // Calculate current visible minute based on scheduled time
            const elapsedMs = Date.now() - match.scheduledAt.getTime();
            const currentMinute = Math.floor(elapsedMs / (60 * 1000 / streamingSpeed));
            maxVisibleMinute = Math.min(currentMinute, totalMinutes);
        }

        // Try to get events from cache first
        let events = await this.matchCacheService.getMatchEvents(matchId);

        if (!events) {
            // Cache miss, fetch from DB
            events = await this.eventRepository.find({
                where: { matchId },
                order: { minute: 'ASC', second: 'ASC' },
            });

            // If we have events and the simulation has run (events exist), cache them
            // We verify simulation has run if we have more than just a kickoff, or any events really.
            if (events && events.length > 0) {
                await this.matchCacheService.cacheMatchEvents(matchId, events);
            }
        }

        // Filter events by visible minute (Timeline Logic)
        const visibleEvents = events.filter(e => e.minute <= maxVisibleMinute);

        // Calculate current score from visible events
        const currentScore = this.calculateScoreFromEvents(visibleEvents, match);

        // Get stats only if match is complete
        let stats = null;
        if (maxVisibleMinute >= totalMinutes) {
            const [homeStats, awayStats] = await Promise.all([
                this.statsRepository.findOne({
                    where: { matchId, teamId: match.homeTeamId },
                }),
                this.statsRepository.findOne({
                    where: { matchId, teamId: match.awayTeamId },
                }),
            ]);
            stats = { home: homeStats!, away: awayStats! };
        }

        return {
            matchId,
            homeTeam: {
                id: match.homeTeam!.id,
                name: match.homeTeam!.name,
                logo: match.homeTeam!.logoUrl || null,
            },
            awayTeam: {
                id: match.awayTeam!.id,
                name: match.awayTeam!.name,
                logo: match.awayTeam!.logoUrl || null,
            },
            scheduledAt: match.scheduledAt,
            currentMinute: Math.max(0, maxVisibleMinute), // Ensure no negative time
            totalMinutes,
            isComplete: maxVisibleMinute >= totalMinutes,
            events: visibleEvents,
            currentScore,
            stats,
        };
    }

    private calculateScoreFromEvents(
        events: MatchEventEntity[],
        match: MatchEntity,
    ): { home: number; away: number } {
        let homeScore = 0;
        let awayScore = 0;

        for (const event of events) {
            if (event.type === MatchEventType.GOAL) {
                if (event.teamId === match.homeTeamId) {
                    homeScore++;
                } else if (event.teamId === match.awayTeamId) {
                    awayScore++;
                }
            }
        }

        return { home: homeScore, away: awayScore };
    }

    /**
     * Validates that the user has access to view this match.
     * This is only called when userId is provided (logged-in users).
     * For public/anonymous access, this method is not called.
     * 
     * Currently enforces that logged-in users can only view matches 
     * where they own one of the participating teams.
     */
    private async validateAccess(
        userId: string,
        match: MatchEntity,
    ): Promise<void> {
        // Check if user owns either team
        const userTeams = await this.teamRepository.find({
            where: { userId },
        });
        const userTeamIds = userTeams.map((t) => t.id);

        const hasAccess =
            userTeamIds.includes(match.homeTeamId as any) ||
            userTeamIds.includes(match.awayTeamId as any);

        if (!hasAccess) {
            throw new ForbiddenException('Access denied to this match');
        }
    }
}
