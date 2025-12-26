import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
    MatchEntity,
    MatchStatus,
    LeagueStandingEntity,
    PlayerEntity,
    MatchEventEntity,
    MatchTacticsEntity,
} from '@goalxi/database';
import { MatchCacheService } from './match-cache.service';

@Injectable()
export class MatchCompletionService {
    private readonly logger = new Logger(MatchCompletionService.name);

    constructor(
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(LeagueStandingEntity)
        private standingRepository: Repository<LeagueStandingEntity>,
        @InjectRepository(PlayerEntity)
        private playerRepository: Repository<PlayerEntity>,
        @InjectRepository(MatchEventEntity)
        private eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(MatchTacticsEntity)
        private tacticsRepository: Repository<MatchTacticsEntity>,
        private matchCacheService: MatchCacheService,
    ) { }

    async completeMatch(matchId: string): Promise<void> {
        this.logger.log(`Completing match ${matchId}...`);

        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!match) {
            this.logger.error(`Match ${matchId} not found for completion`);
            return;
        }

        if (match.status === MatchStatus.COMPLETED) {
            this.logger.warn(`Match ${matchId} is already completed. Skipping.`);
            return;
        }

        // 1. Update Match status
        match.status = MatchStatus.COMPLETED;
        match.completedAt = new Date();
        await this.matchRepository.save(match);

        // 2. Update League Standings
        await this.updateLeagueStandings(match);

        // 3. Update Player Stats
        await this.updatePlayerStats(matchId);

        // 4. Invalidate Cache
        await this.matchCacheService.invalidateMatchCache(matchId);

        this.logger.log(`Match ${matchId} completion processing finished.`);
    }

    private async updateLeagueStandings(match: MatchEntity): Promise<void> {
        const { leagueId, season, homeTeamId, awayTeamId, homeScore, awayScore } = match;

        if (homeScore === undefined || awayScore === undefined) {
            this.logger.error(`Cannot update standings for match ${match.id}: Score is undefined`);
            return;
        }

        const [homeStanding, awayStanding] = await Promise.all([
            this.getOrCreateStanding(leagueId, homeTeamId, season),
            this.getOrCreateStanding(leagueId, awayTeamId, season),
        ]);

        // Update home team stats
        homeStanding.goalsFor += homeScore;
        homeStanding.goalsAgainst += awayScore;

        // Update away team stats
        awayStanding.goalsFor += awayScore;
        awayStanding.goalsAgainst += homeScore;

        if (homeScore > awayScore) {
            homeStanding.wins += 1;
            homeStanding.points += 3;
            awayStanding.losses += 1;
        } else if (homeScore < awayScore) {
            awayStanding.wins += 1;
            awayStanding.points += 3;
            homeStanding.losses += 1;
        } else {
            homeStanding.draws += 1;
            homeStanding.points += 1;
            awayStanding.draws += 1;
            awayStanding.points += 1;
        }

        await this.standingRepository.save([homeStanding, awayStanding]);
    }

    private async getOrCreateStanding(leagueId: string, teamId: string, season: number): Promise<LeagueStandingEntity> {
        let standing = await this.standingRepository.findOne({
            where: { leagueId, teamId, season },
        });

        if (!standing) {
            standing = new LeagueStandingEntity();
            standing.leagueId = leagueId;
            standing.teamId = teamId;
            standing.season = season;
            standing.position = 0; // Will be recalculated by a separate service if needed
            standing.points = 0;
            standing.wins = 0;
            standing.draws = 0;
            standing.losses = 0;
            standing.goalsFor = 0;
            standing.goalsAgainst = 0;
        }

        return standing;
    }

    private async updatePlayerStats(matchId: string): Promise<void> {
        const events = await this.eventRepository.find({
            where: { matchId },
        });

        const playerStatsUpdate = new Map<string, { goals: number, assists: number, yellowCards: number, redCards: number, appearances: number }>();

        // 1. Initialise appearances from Tactics
        const tactics = await this.tacticsRepository.find({ where: { matchId } });
        for (const t of tactics) {
            for (const playerId of Object.values(t.lineup)) {
                if (typeof playerId === 'string') {
                    this.ensurePlayerInMap(playerStatsUpdate, playerId);
                }
            }
        }

        // 2. Add stats from events
        for (const event of events) {
            if (event.playerId) {
                this.ensurePlayerInMap(playerStatsUpdate, event.playerId);
                const stats = playerStatsUpdate.get(event.playerId)!;

                if (event.typeName === 'goal' || event.typeName === 'penalty_goal') {
                    stats.goals += 1;
                } else if (event.typeName === 'assist') {
                    stats.assists += 1;
                } else if (event.typeName === 'yellow_card') {
                    stats.yellowCards += 1;
                } else if (event.typeName === 'red_card') {
                    stats.redCards += 1;
                }
            }
            // Add assist handling if data.assistPlayerId exists
            if (event.data?.assistPlayerId) {
                this.ensurePlayerInMap(playerStatsUpdate, event.data.assistPlayerId);
                playerStatsUpdate.get(event.data.assistPlayerId)!.assists += 1;
            }
        }

        // What about players who played but didn't have events?
        // In Step 4/8, we should ideally fetch the tactics and mark everyone as played.
        // Let's postpone full "appearance" tracking until tactics are fully integrated here, 
        // or just rely on events that mention players for now.
        // Actually, the MatchSimulationProcessor has access to homeSimPlayers and awaySimPlayers.
        // Maybe we should pass that info? No, MatchCompletionService is a separate job.

        // Let's update what we have.
        for (const [playerId, stats] of playerStatsUpdate.entries()) {
            const player = await this.playerRepository.findOne({ where: { id: playerId as any } });
            if (player) {
                if (!player.careerStats) player.careerStats = { club: { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 } };
                if (!player.careerStats.club) player.careerStats.club = { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

                player.careerStats.club.matches += 1; // Mark as played
                player.careerStats.club.goals += stats.goals;
                player.careerStats.club.assists += stats.assists;
                player.careerStats.club.yellowCards += stats.yellowCards;
                player.careerStats.club.redCards += stats.redCards;

                await this.playerRepository.save(player);
            }
        }
    }

    private ensurePlayerInMap(map: Map<string, any>, playerId: string) {
        if (!map.has(playerId)) {
            map.set(playerId, { goals: 0, assists: 0, yellowCards: 0, redCards: 0, appearances: 1 });
        }
    }
}
