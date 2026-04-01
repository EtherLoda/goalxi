import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
    MatchEntity,
    MatchStatus,
    LeagueStandingEntity,
    PlayerEntity,
    MatchEventEntity,
    MatchTacticsEntity,
    TeamEntity,
    StadiumEntity,
    FanEntity,
    TransactionType,
    TICKET_PRICE_MULTIPLIER,
    Uuid,
} from '@goalxi/database';
import { MatchCacheService } from './match-cache.service';
import { FinanceService } from '../finance/finance.service';
import { FanService } from '../fan/fan.service';

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
        @InjectRepository(TeamEntity)
        private teamRepository: Repository<TeamEntity>,
        @InjectRepository(StadiumEntity)
        private stadiumRepository: Repository<StadiumEntity>,
        @InjectRepository(FanEntity)
        private fanRepository: Repository<FanEntity>,
        private matchCacheService: MatchCacheService,
        private financeService: FinanceService,
        private fanService: FanService,
    ) { }

    async completeMatch(matchId: string): Promise<void> {
        this.logger.log(`Completing match ${matchId}...`);

        // Check if stats already processed to avoid double counting
        const isProcessed = await this.matchCacheService.isMatchProcessed(matchId);
        if (isProcessed) {
            this.logger.warn(`Match ${matchId} statistics already processed. Skipping duplicated job.`);
            return;
        }

        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam', 'league'],
        });

        if (!match) {
            this.logger.error(`Match ${matchId} not found for completion`);
            return;
        }

        // 1. Update Match status (only if not already updated by scheduler)
        if (match.status !== MatchStatus.COMPLETED) {
            match.status = MatchStatus.COMPLETED;
            match.completedAt = match.completedAt || new Date();
            await this.matchRepository.save(match);
        }

        // 2. Update League Standings
        await this.updateLeagueStandings(match);

        // 3. Update Player Stats
        await this.updatePlayerStats(matchId);

        // 4. Update ELO ratings
        await this.updateEloRatings(match);

        // 5. Update Fan Morale and Calculate Revenue
        await this.updateFanAndRevenue(match);

        // 6. Mark as processed in cache
        await this.matchCacheService.setMatchProcessed(matchId);

        // 7. Invalidate Cache
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
            select: ['id', 'typeName', 'playerId', 'relatedPlayerId'],
        });

        const playerStatsUpdate = new Map<string, { goals: number, assists: number, yellowCards: number, redCards: number, appearances: number }>();

        // 1. Initialise appearances from Lineups
        const tactics = await this.tacticsRepository.find({ where: { matchId } });
        for (const t of tactics) {
            // Starters
            for (const playerId of Object.values(t.lineup)) {
                if (typeof playerId === 'string') {
                    this.ensurePlayerInMap(playerStatsUpdate, playerId);
                }
            }
            // Substitutes (who were actually called to play, according to tactics)
            if (t.substitutions) {
                for (const sub of t.substitutions) {
                    this.ensurePlayerInMap(playerStatsUpdate, sub.in);
                }
            }
        }

        // 2. Add stats from events
        for (const event of events) {
            const type = (event.typeName || '').toLowerCase();

            // Handle main player in the event
            if (event.playerId) {
                this.ensurePlayerInMap(playerStatsUpdate, event.playerId);
                const stats = playerStatsUpdate.get(event.playerId)!;

                if (type === 'goal' || type === 'penalty_goal') {
                    stats.goals += 1;
                } else if (type === 'yellow_card') {
                    stats.yellowCards += 1;
                } else if (type === 'red_card') {
                    stats.redCards += 1;
                } else if (type === 'substitution') {
                    // Mark sub IN player as appeared
                    stats.appearances = 1;
                    // Mark sub OUT player as also appeared (they played until this minute)
                    const subData = (event as any).data;
                    if (subData?.playerId) {
                        this.ensurePlayerInMap(playerStatsUpdate, subData.playerId);
                        playerStatsUpdate.get(subData.playerId)!.appearances = 1;
                    }
                }
            }

            // Handle assisting player (stored in relatedPlayerId for goal events)
            if (event.relatedPlayerId && (type === 'goal' || type === 'penalty_goal')) {
                this.ensurePlayerInMap(playerStatsUpdate, event.relatedPlayerId);
                const assistStats = playerStatsUpdate.get(event.relatedPlayerId)!;
                assistStats.assists += 1;
            }

            // Backward compatibility for data.assistPlayerId — removed; assist info is now in relatedPlayerId (handled above)
        }

        // What about players who played but didn't have events?
        // In Step 4/8, we should ideally fetch the tactics and mark everyone as played.
        // Let's postpone full "appearance" tracking until tactics are fully integrated here, 
        // or just rely on events that mention players for now.
        // Actually, the MatchSimulationProcessor has access to homeSimPlayers and awaySimPlayers.
        // Maybe we should pass that info? No, MatchCompletionService is a separate job.

        // 3. Batch update players to avoid memory issues
        const playerIds = Array.from(playerStatsUpdate.keys());
        if (playerIds.length === 0) return;

        const players = await this.playerRepository.find({
            where: { id: In(playerIds as any[]) },
        });

        const playersToUpdate: PlayerEntity[] = [];

        for (const player of players) {
            const stats = playerStatsUpdate.get(player.id);
            if (stats) {
                if (!player.careerStats) player.careerStats = { club: { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 } };
                if (!player.careerStats.club) player.careerStats.club = { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

                player.careerStats.club.matches += 1; // Mark as played
                player.careerStats.club.goals += stats.goals;
                player.careerStats.club.assists += stats.assists;
                player.careerStats.club.yellowCards += stats.yellowCards;
                player.careerStats.club.redCards += stats.redCards;

                playersToUpdate.push(player);
            }
        }

        // Batch save all players
        if (playersToUpdate.length > 0) {
            await this.playerRepository.save(playersToUpdate);
        }
    }

    private ensurePlayerInMap(map: Map<string, any>, playerId: string) {
        if (!map.has(playerId)) {
            map.set(playerId, { goals: 0, assists: 0, yellowCards: 0, redCards: 0, appearances: 1 });
        }
    }

    /**
     * Update ELO ratings after match
     */
    private async updateEloRatings(match: MatchEntity): Promise<void> {
        if (!match.homeTeam || !match.awayTeam || match.homeScore === undefined || match.awayScore === undefined) {
            return;
        }

        const homeElo = match.homeTeam.eloRating || 1500;
        const awayElo = match.awayTeam.eloRating || 1500;
        const K = 32;

        // Expected score
        const expectedHome = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
        const expectedAway = 1 - expectedHome;

        // Actual score
        const actualHome = match.homeScore > match.awayScore ? 1 : match.homeScore < match.awayScore ? 0 : 0.5;
        const actualAway = 1 - actualHome;

        // Update ELO
        const newHomeElo = homeElo + K * (actualHome - expectedHome);
        const newAwayElo = awayElo + K * (actualAway - expectedAway);

        await this.teamRepository.update({ id: match.homeTeamId as Uuid }, { eloRating: Math.round(newHomeElo) });
        await this.teamRepository.update({ id: match.awayTeamId as Uuid }, { eloRating: Math.round(newAwayElo) });

        this.logger.debug(
            `ELO update: ${match.homeTeam.name} ${homeElo} -> ${Math.round(newHomeElo)}, ` +
            `${match.awayTeam.name} ${awayElo} -> ${Math.round(newAwayElo)}`,
        );
    }

    /**
     * Update fan morale and calculate stadium revenue
     */
    private async updateFanAndRevenue(match: MatchEntity): Promise<void> {
        if (!match.homeTeam || !match.awayTeam || match.homeScore === undefined || match.awayScore === undefined) {
            return;
        }

        const tier = match.league?.tier || 4;
        const homeElo = match.homeTeam.eloRating || 1500;
        const awayElo = match.awayTeam.eloRating || 1500;

        // Get expected points for home team
        const homeExpected = this.fanService.getExpectedPoints(homeElo, awayElo);
        const awayExpected = this.fanService.getExpectedPoints(awayElo, homeElo);

        // Determine results
        const homeResult: 'W' | 'D' | 'L' =
            match.homeScore > match.awayScore ? 'W' :
            match.homeScore < match.awayScore ? 'L' : 'D';
        const awayResult: 'W' | 'D' | 'L' =
            homeResult === 'W' ? 'L' : homeResult === 'L' ? 'W' : 'D';

        // Calculate actual points
        const homeActualPoints = homeResult === 'W' ? 3 : homeResult === 'D' ? 1 : 0;
        const awayActualPoints = awayResult === 'W' ? 3 : awayResult === 'D' ? 1 : 0;

        // Update fan morale
        await this.fanService.updateAfterMatch(
            match.homeTeamId,
            homeActualPoints,
            homeExpected,
            homeResult,
        );
        await this.fanService.updateAfterMatch(
            match.awayTeamId,
            awayActualPoints,
            awayExpected,
            awayResult,
        );

        // Calculate and record stadium revenue
        await this.calculateStadiumRevenue(match, tier);
    }

    /**
     * Calculate and record stadium revenue
     */
    private async calculateStadiumRevenue(match: MatchEntity, tier: number): Promise<void> {
        const homeStadium = await this.stadiumRepository.findOne({ where: { teamId: match.homeTeamId } });
        const homeFan = await this.fanRepository.findOne({ where: { teamId: match.homeTeamId } });
        const awayFan = await this.fanRepository.findOne({ where: { teamId: match.awayTeamId } });

        if (!homeStadium?.isBuilt || !homeFan) {
            return;
        }

        const homeFans = homeFan.totalFans;
        const awayFans = awayFan?.totalFans || 0;

        const homeMorale = homeFan.fanEmotion;
        const awayMorale = awayFan?.fanEmotion || 50;

        // Calculate attendance
        const totalAttendance = this.fanService.calculateAttendance(
            homeFans,
            awayFans,
            homeMorale,
            awayMorale,
            homeStadium.capacity,
        );

        // Calculate revenue
        const baseTicketPrice = 30;
        const tierMultiplier = TICKET_PRICE_MULTIPLIER[tier as keyof typeof TICKET_PRICE_MULTIPLIER] || 1.0;
        const ticketRevenue = Math.round(totalAttendance * baseTicketPrice * tierMultiplier);

        // Record revenue
        await this.financeService.processTransaction(
            match.homeTeamId as Uuid,
            ticketRevenue,
            TransactionType.TICKET_INCOME,
            match.season,
        );

        this.logger.debug(
            `Stadium revenue for ${match.homeTeam?.name}: ${totalAttendance} total fans = ${ticketRevenue} (tier ${tier})`,
        );
    }
}
