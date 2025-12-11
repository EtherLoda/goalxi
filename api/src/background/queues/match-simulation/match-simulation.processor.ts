import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchStatus,
    MatchTacticsEntity,
    PlayerEntity,
    TeamEntity,
} from '@goalxi/database';
import { SimulationService } from '../../../simulation/simulation.service';
import { MatchEvent } from '../../../api/match/engine/match.engine';

@Processor('match-simulation')
@Injectable()
export class MatchSimulationProcessor extends WorkerHost {
    private readonly logger = new Logger(MatchSimulationProcessor.name);

    constructor(
        private readonly simulationService: SimulationService,
        @InjectRepository(MatchEntity)
        private matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchEventEntity)
        private eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(MatchTeamStatsEntity)
        private statsRepository: Repository<MatchTeamStatsEntity>,
        @InjectRepository(MatchTacticsEntity)
        private tacticsRepository: Repository<MatchTacticsEntity>,
        @InjectRepository(PlayerEntity)
        private playerRepository: Repository<PlayerEntity>,
        @InjectRepository(TeamEntity)
        private teamRepository: Repository<TeamEntity>,
    ) {
        super();
    }

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing match simulation for match ID: ${job.data.matchId}`);

        const { matchId } = job.data;

        try {
            // 1. Fetch Match Data (Verification)
            const match = await this.matchRepository.findOne({
                where: { id: matchId },
                relations: ['homeTeam', 'awayTeam'],
            });

            if (!match) {
                throw new Error(`Match ${matchId} not found`);
            }

            if (match.status === MatchStatus.COMPLETED) {
                this.logger.warn(`Match ${matchId} is already completed. Skipping simulation.`);
                return;
            }

            // 2. Fetch Tactics & Players
            const homeTactics = await this.tacticsRepository.findOne({ where: { matchId, teamId: match.homeTeamId } });
            const awayTactics = await this.tacticsRepository.findOne({ where: { matchId, teamId: match.awayTeamId } });

            if (!homeTactics || !awayTactics) {
                if (job.data.homeForfeit || job.data.awayForfeit) {
                    await this.handleForfeit(match, job.data.homeForfeit, job.data.awayForfeit);
                    return;
                }
                throw new Error('Missing tactics for simulation');
            }

            // Fetch Players for both teams
            const homePlayerIds = Object.values(homeTactics.lineup).filter(id => typeof id === 'string');
            const awayPlayerIds = Object.values(awayTactics.lineup).filter(id => typeof id === 'string');

            const [homePlayers, awayPlayers] = await Promise.all([
                this.playerRepository.find({ where: { id: In(homePlayerIds) } }),
                this.playerRepository.find({ where: { id: In(awayPlayerIds) } }),
            ]);

            // Map Players to Lineup Positions
            const mapPlayers = (lineup: any, players: PlayerEntity[]) => {
                const mapped: { entity: PlayerEntity, positionKey: string }[] = [];
                for (const [pos, id] of Object.entries(lineup)) {
                    const player = players.find(p => p.id === id);
                    if (player) {
                        mapped.push({ entity: player, positionKey: pos });
                    }
                }
                return mapped;
            };

            const homeSimPlayers = mapPlayers(homeTactics.lineup, homePlayers);
            const awaySimPlayers = mapPlayers(awayTactics.lineup, awayPlayers);

            // 3. Run Simulation
            const events = this.simulationService.simulateMatch(
                match.homeTeam.name,
                homeSimPlayers,
                match.awayTeam.name,
                awaySimPlayers
            );

            // 4. Calculate Results
            const homeScore = events.filter(e => e.type === 'goal' && e.teamName === match.homeTeam.name).length;
            const awayScore = events.filter(e => e.type === 'goal' && e.teamName === match.awayTeam.name).length;

            // 5. Persist Data

            // Save Events
            const eventEntities = events.map(e => {
                const evt = new MatchEventEntity();
                evt.matchId = match.id;
                evt.minute = e.minute;
                evt.second = 0;
                evt.type = this.mapEventType(e.type);
                evt.typeName = e.type;
                evt.data = e.data || {};

                if (e.teamName === match.homeTeam.name) evt.teamId = match.homeTeamId;
                if (e.teamName === match.awayTeam.name) evt.teamId = match.awayTeamId;
                if (e.playerId) evt.playerId = e.playerId;
                return evt;
            });

            await this.eventRepository.save(eventEntities);

            // Save Stats
            const homeStats = this.calculateStats(events, match.homeTeam.name, match.id, match.homeTeamId);
            const awayStats = this.calculateStats(events, match.awayTeam.name, match.id, match.awayTeamId);

            await this.statsRepository.save([homeStats, awayStats]);

            // Update Match
            match.homeScore = homeScore;
            match.awayScore = awayScore;
            match.status = MatchStatus.COMPLETED;
            match.simulationCompletedAt = new Date();

            await this.matchRepository.save(match);

            this.logger.log(`Simulation completed for match ${matchId}. Score: ${homeScore}-${awayScore}`);

        } catch (error) {
            this.logger.error(`Simulation failed for match ${matchId}: ${error.message}`, error.stack);
            throw error;
        }
    }

    private async handleForfeit(match: MatchEntity, homeForfeit: boolean, awayForfeit: boolean) {
        match.status = MatchStatus.COMPLETED;
        match.simulationCompletedAt = new Date();
        if (homeForfeit && awayForfeit) {
            match.homeScore = 0;
            match.awayScore = 0;
        } else if (homeForfeit) {
            match.homeScore = 0;
            match.awayScore = 3;
        } else {
            match.homeScore = 3;
            match.awayScore = 0;
        }
        await this.matchRepository.save(match);
        this.logger.log(`Match ${match.id} resolved via forfeit.`);
    }

    private mapEventType(engineType: string): number {
        switch (engineType) {
            case 'goal': return 1;
            case 'assist': return 2;
            case 'shot': return 3;
            case 'save': return 4;
            case 'yellow_card': return 5;
            case 'red_card': return 6;
            case 'substitution': return 7;
            case 'injury': return 8;
            case 'foul': return 9;
            case 'offside': return 10;
            case 'corner': return 11;
            case 'penalty_goal': return 12;
            case 'penalty_miss': return 13;
            case 'turnover': return 20;
            case 'snapshot': return 21;
            case 'miss': return 3;
            default: return 99;
        }
    }

    private calculateStats(events: MatchEvent[], teamName: string, matchId: string, teamId: string): MatchTeamStatsEntity {
        const teamEvents = events.filter(e => e.teamName === teamName || (e.type === 'save' && e.teamName !== teamName));
        const goals = events.filter(e => e.type === 'goal' && e.teamName === teamName).length;
        const misses = events.filter(e => e.type === 'miss' && e.teamName === teamName).length;
        const savesByOpponent = events.filter(e => e.type === 'save' && e.teamName !== teamName).length;

        const shotsOnTarget = goals + savesByOpponent;
        const shots = shotsOnTarget + misses;

        const stats = new MatchTeamStatsEntity();
        stats.matchId = matchId;
        stats.teamId = teamId;
        stats.possessionPercentage = 50.0;
        stats.shots = shots;
        stats.shotsOnTarget = shotsOnTarget;
        stats.corners = events.filter(e => e.type === 'corner' && e.teamName === teamName).length;
        stats.fouls = events.filter(e => e.type === 'foul' && e.teamName === teamName).length;
        stats.offsides = events.filter(e => e.type === 'offside' && e.teamName === teamName).length;
        stats.yellowCards = events.filter(e => e.type === 'yellow_card' && e.teamName === teamName).length;
        stats.redCards = events.filter(e => e.type === 'red_card' && e.teamName === teamName).length;
        stats.passesCompleted = 0;
        stats.passesAttempted = 0;

        return stats;
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.debug(`Match simulation job ${job.id} completed.`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, err: Error) {
        this.logger.error(`Match simulation job ${job.id} failed: ${err.message}`);
    }
}
