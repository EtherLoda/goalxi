import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, In } from 'typeorm';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    TeamEntity,
    GAME_SETTINGS,
    MatchStatus,
    MatchEventType,
} from '@goalxi/database';
import { MatchCacheService } from './match-cache.service';

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

        const now = new Date();
        const matchStartTime = new Date(match.scheduledAt);
        
        // Calculate total match duration
        const totalMinutes =
            90 +
            (match.firstHalfInjuryTime || 0) +
            (match.secondHalfInjuryTime || 0) +
            (match.hasExtraTime ? 30 + (match.extraTimeFirstHalfInjury || 0) + (match.extraTimeSecondHalfInjury || 0) : 0);

        // Calculate current match minute based on elapsed real-world time
        let currentMinute = 0;
        if (match.status === MatchStatus.IN_PROGRESS) {
            if (now >= matchStartTime) {
                const elapsedMs = now.getTime() - matchStartTime.getTime();
                const elapsedMinutes = Math.floor(elapsedMs / (60 * 1000));
                
                // Account for 15-minute halftime break
                if (elapsedMinutes <= 45) {
                    // First half
                    currentMinute = elapsedMinutes;
                } else if (elapsedMinutes <= 60) {
                    // Halftime break (no game time passes)
                    currentMinute = 45;
                } else {
                    // Second half (subtract 15-minute break)
                    currentMinute = elapsedMinutes - 15;
                    
                    // If extra time, account for additional breaks
                    if (currentMinute > 90 && match.hasExtraTime) {
                        // In extra time range
                        // No additional adjustment needed, currentMinute continues from 91+
                    }
                }
                
                // Cap at total minutes
                currentMinute = Math.min(currentMinute, totalMinutes);
            }
        } else if (match.status === MatchStatus.COMPLETED) {
            currentMinute = totalMinutes;
        }

        // Try to get events from cache first
        let events = await this.matchCacheService.getMatchEvents(matchId);

        if (!events) {
            // Cache miss, fetch from DB
            events = await this.eventRepository.find({
                where: { matchId },
                order: { phase: 'ASC', minute: 'ASC', second: 'ASC' },
                select: ['id', 'matchId', 'minute', 'second', 'type', 'typeName', 'teamId', 'playerId',
                         'relatedPlayerId', 'phase', 'lane', 'isHome', 'data',
                         'eventScheduledTime', 'isRevealed', 'createdAt'],
            });

            // If we have events and the simulation has run (events exist), cache them
            if (events && events.length > 0) {
                await this.matchCacheService.cacheMatchEvents(matchId, events);
            }
        }

        // Filter events by eventScheduledTime (only show events that should have happened by now)
        const visibleEvents = events.filter(e => {
            // If match is completed, show all events
            if (match.status === MatchStatus.COMPLETED) {
                return true;
            }
            
            // Otherwise, only show events whose scheduled time has passed
            if (e.eventScheduledTime) {
                return e.eventScheduledTime <= now;
            }
            
            // Fallback for events without eventScheduledTime (old data)
            return e.minute <= currentMinute;
        });
        
        // Mark events as revealed if their time has passed
        const eventsToUpdate = events.filter(e => 
            e.eventScheduledTime && 
            e.eventScheduledTime <= now && 
            !e.isRevealed
        );
        
        if (eventsToUpdate.length > 0) {
            await this.eventRepository.update(
                { id: In(eventsToUpdate.map(e => e.id)) },
                { isRevealed: true }
            );
            // Invalidate cache since we updated event revealed status
            await this.matchCacheService.invalidateMatchCache(matchId);
        }

        // Calculate current score from visible events
        const currentScore = this.calculateScoreFromEvents(visibleEvents, match);

        // Get stats only if match is complete
        let stats = null;
        if (match.status === MatchStatus.COMPLETED) {
            const [homeStats, awayStats] = await Promise.all([
                this.statsRepository.findOne({
                    where: { matchId, teamId: match.homeTeamId },
                }),
                this.statsRepository.findOne({
                    where: { matchId, teamId: match.awayTeamId },
                }),
            ]);
            if (homeStats && awayStats) {
                stats = { home: homeStats, away: awayStats };
            }
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
            currentMinute: Math.max(0, currentMinute),
            totalMinutes,
            isComplete: match.status === MatchStatus.COMPLETED,
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
