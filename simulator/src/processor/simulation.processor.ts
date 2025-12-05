import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchStatus,
    PlayerEntity,
    MatchType,
} from '@goalxi/database';
import { MatchEngine } from '../engine/match.engine';
import { MatchEventType } from '../engine/types';

interface SimulationJobData {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeTactics: any;
    awayTactics: any;
    homeForfeit: boolean;
    awayForfeit: boolean;
    matchType: string;
}

@Processor('match-simulation')
@Injectable()
export class SimulationProcessor extends WorkerHost {
    private readonly logger = new Logger(SimulationProcessor.name);

    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchEventEntity)
        private readonly eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(MatchTeamStatsEntity)
        private readonly statsRepository: Repository<MatchTeamStatsEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepository: Repository<PlayerEntity>,
        private readonly dataSource: DataSource,
    ) {
        super();
    }

    async process(job: Job<SimulationJobData>): Promise<void> {
        const { matchId, homeTactics, awayTactics, homeForfeit, awayForfeit } =
            job.data;

        this.logger.log(`[Simulator] Processing match ${matchId}`);

        const match = await this.matchRepository.findOne({
            where: { id: matchId },
        });

        if (!match) {
            throw new Error(`Match ${matchId} not found`);
        }

        if (homeForfeit || awayForfeit) {
            await this.handleForfeit(match, homeForfeit, awayForfeit);
        } else {
            await this.runSimulation(match, homeTactics, awayTactics);
        }

        this.logger.log(`[Simulator] Completed match ${matchId}`);
    }

    private async runSimulation(
        match: MatchEntity,
        homeTactics: any,
        awayTactics: any,
    ): Promise<void> {
        // Run engine
        const engine = new MatchEngine(match, homeTactics, awayTactics);
        const finalState = engine.simulateMatch();

        // Save to database
        await this.dataSource.transaction(async (manager) => {
            // Update match
            match.homeScore = finalState.homeScore;
            match.awayScore = finalState.awayScore;
            match.status = MatchStatus.COMPLETED;
            match.simulationCompletedAt = new Date();
            await manager.save(match);

            // Save events
            const eventEntities = finalState.events.map((event) =>
                manager.create(MatchEventEntity, {
                    matchId: match.id,
                    minute: event.minute,
                    second: event.second || 0,
                    type: event.type,
                    typeName: event.typeName,
                    teamId: event.teamId || null,
                    playerId: event.playerId || null,
                    relatedPlayerId: event.relatedPlayerId || null,
                    data: event.data || null,
                }),
            );
            await manager.save(eventEntities);

            // Save stats
            const homeStats = manager.create(MatchTeamStatsEntity, {
                matchId: match.id,
                teamId: match.homeTeamId,
                possession:
                    (finalState.stats.home.possessionTime /
                        (finalState.currentTime || 90)) *
                    100,
                shots: finalState.stats.home.shots,
                shotsOnTarget: finalState.stats.home.shotsOnTarget,
                passes: finalState.stats.home.passes,
                passAccuracy:
                    finalState.stats.home.passes > 0
                        ? (finalState.stats.home.passesCompleted /
                            finalState.stats.home.passes) *
                        100
                        : 0,
                tackles: finalState.stats.home.tackles,
                fouls: finalState.stats.home.fouls,
                corners: finalState.stats.home.corners,
                offsides: finalState.stats.home.offsides,
                yellowCards: finalState.stats.home.yellowCards,
                redCards: finalState.stats.home.redCards,
            });

            const awayStats = manager.create(MatchTeamStatsEntity, {
                matchId: match.id,
                teamId: match.awayTeamId,
                possession:
                    (finalState.stats.away.possessionTime /
                        (finalState.currentTime || 90)) *
                    100,
                shots: finalState.stats.away.shots,
                shotsOnTarget: finalState.stats.away.shotsOnTarget,
                passes: finalState.stats.away.passes,
                passAccuracy:
                    finalState.stats.away.passes > 0
                        ? (finalState.stats.away.passesCompleted /
                            finalState.stats.away.passes) *
                        100
                        : 0,
                tackles: finalState.stats.away.tackles,
                fouls: finalState.stats.away.fouls,
                corners: finalState.stats.away.corners,
                offsides: finalState.stats.away.offsides,
                yellowCards: finalState.stats.away.yellowCards,
                redCards: finalState.stats.away.redCards,
            });

            await manager.save([homeStats, awayStats]);

            // Update player career stats
            await this.updatePlayerStats(manager, match, finalState.events, homeTactics, awayTactics);
        });
    }

    private async updatePlayerStats(
        manager: any,
        match: MatchEntity,
        events: any[],
        homeTactics: any,
        awayTactics: any,
    ): Promise<void> {
        const playerIds = new Set<string>();

        // Helper to process team tactics
        const processTeam = (tactics: any) => {
            if (!tactics || !tactics.lineup) return;

            // Starters
            tactics.lineup.forEach((p: any) => {
                playerIds.add(p.playerId);
            });

            // Substitutions
            if (tactics.substitutions) {
                tactics.substitutions.forEach((sub: any) => {
                    playerIds.add(sub.playerInId);
                });
            }
        };

        processTeam(homeTactics);
        processTeam(awayTactics);

        if (playerIds.size === 0) return;

        // Fetch players
        const playersList = await manager
            .createQueryBuilder(PlayerEntity, 'player')
            .where('player.id IN (:...ids)', { ids: Array.from(playerIds) })
            .getMany();

        const isNationalMatch = match.type === MatchType.NATIONAL_TEAM;

        for (const player of playersList) {
            // Initialize stats if missing
            if (!player.careerStats) player.careerStats = { club: { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 } };
            if (!player.careerStats.club) player.careerStats.club = { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };

            let statsTarget = player.careerStats.club;

            if (isNationalMatch) {
                if (!player.careerStats.national) {
                    player.careerStats.national = { matches: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
                }
                statsTarget = player.careerStats.national;
            }

            // Update basic stats
            statsTarget.matches++;

            // Calculate events for this player
            const playerEvents = events.filter((e: any) => e.playerId === player.id);

            statsTarget.goals += playerEvents.filter((e: any) => e.type === MatchEventType.GOAL).length;
            statsTarget.yellowCards += playerEvents.filter((e: any) => e.type === MatchEventType.YELLOW_CARD).length;
            statsTarget.redCards += playerEvents.filter((e: any) => e.type === MatchEventType.RED_CARD).length;

            // Assists
            const assists = events.filter((e: any) => e.type === MatchEventType.GOAL && e.relatedPlayerId === player.id).length;
            statsTarget.assists += assists;

            // Save
            await manager.save(player);
        }
    }

    private async handleForfeit(
        match: MatchEntity,
        homeForfeit: boolean,
        awayForfeit: boolean,
    ): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            // Set forfeit score (0-5)
            match.homeScore = homeForfeit ? 0 : 5;
            match.awayScore = awayForfeit ? 0 : 5;
            match.status = MatchStatus.COMPLETED;
            match.simulationCompletedAt = new Date();
            await manager.save(match);

            // Create forfeit event
            const forfeitEvent = manager.create(MatchEventEntity, {
                matchId: match.id,
                minute: 0,
                second: 0,
                type: MatchEventType.FORFEIT,
                typeName: 'FORFEIT',
                teamId: homeForfeit ? match.homeTeamId : match.awayTeamId,
                data: { reason: 'No tactics submitted' },
            });
            await manager.save(forfeitEvent);

            // Create empty stats
            const emptyStats = {
                possession: 0,
                shots: 0,
                shotsOnTarget: 0,
                passes: 0,
                passAccuracy: 0,
                tackles: 0,
                fouls: 0,
                corners: 0,
                offsides: 0,
                yellowCards: 0,
                redCards: 0,
            };

            const homeStats = manager.create(MatchTeamStatsEntity, {
                matchId: match.id,
                teamId: match.homeTeamId,
                ...emptyStats,
            });

            const awayStats = manager.create(MatchTeamStatsEntity, {
                matchId: match.id,
                teamId: match.awayTeamId,
                ...emptyStats,
            });

            await manager.save([homeStats, awayStats]);
        });
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(`Job ${job.id} failed with error: ${error.message}`);
    }
}
