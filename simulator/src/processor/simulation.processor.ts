
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
    MatchEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    MatchStatus,
    MatchTacticsEntity,
    PlayerEntity,
    TeamEntity,
    MatchType,
} from '@goalxi/database';
import { MatchEngine, MatchEvent } from '../engine/match.engine';
import { Team } from '../engine/classes/Team';
import { PlayerAdapter } from '../utils/player-adapter';
import { TacticalInstruction, TacticalPlayer } from '../engine/types/simulation.types';

interface SimulationJobData {
    matchId: string;
    homeForfeit?: boolean;
    awayForfeit?: boolean;
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
        @InjectRepository(MatchTacticsEntity)
        private readonly tacticsRepository: Repository<MatchTacticsEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepository: Repository<PlayerEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
        private readonly dataSource: DataSource,
    ) {
        super();
    }

    async process(job: Job<SimulationJobData>): Promise<void> {
        const { matchId, homeForfeit, awayForfeit } = job.data;

        this.logger.log(`[Simulator] Processing match ${matchId}`);

        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!match) {
            this.logger.error(`Match ${matchId} not found`);
            return;
        }

        if (match.status === MatchStatus.COMPLETED) {
            this.logger.warn(`Match ${matchId} already completed.`);
            return;
        }

        if (homeForfeit || awayForfeit) {
            await this.handleForfeit(match, !!homeForfeit, !!awayForfeit);
        } else {
            await this.runSimulation(match);
        }

        this.logger.log(`[Simulator] Completed match ${matchId}`);
    }

    private findPositionInLineup(lineup: Record<string, string>, playerId: string): string | undefined {
        return Object.keys(lineup).find(key => lineup[key] === playerId);
    }

    private async runSimulation(match: MatchEntity): Promise<void> {
        // 1. Fetch Tactics
        const homeTactics = await this.tacticsRepository.findOne({ where: { matchId: match.id, teamId: match.homeTeamId } });
        const awayTactics = await this.tacticsRepository.findOne({ where: { matchId: match.id, teamId: match.awayTeamId } });

        if (!homeTactics || !awayTactics) {
            throw new Error(`Tactics missing for match ${match.id}`);
        }

        // 2. Fetch Players
        const homeStarterIds = Object.values(homeTactics.lineup).filter(id => typeof id === 'string');
        const awayStarterIds = Object.values(awayTactics.lineup).filter(id => typeof id === 'string');
        const homeSubIds = (homeTactics.substitutions || []).map(s => s.in);
        const awaySubIds = (awayTactics.substitutions || []).map(s => s.in);

        const allPlayerIds = [...homeStarterIds, ...awayStarterIds, ...homeSubIds, ...awaySubIds];
        const allPlayers = await this.playerRepository.find({
            where: { id: In(allPlayerIds) }
        });

        // 3. Map Instructions
        const mapInstructions = (tactics: MatchTacticsEntity): TacticalInstruction[] => {
            const results: TacticalInstruction[] = [];
            if (tactics.substitutions) {
                for (const s of tactics.substitutions) {
                    results.push({
                        minute: s.minute,
                        type: 'swap',
                        playerId: s.out,
                        newPlayerId: s.in,
                        newPosition: this.findPositionInLineup(tactics.lineup, s.out) || 'CF'
                    });
                }
            }
            return results;
        };

        const homeInstructions = mapInstructions(homeTactics);
        const awayInstructions = mapInstructions(awayTactics);

        // 4. Setup Engine Teams
        const homeTacticalPlayers: TacticalPlayer[] = homeStarterIds.map(pid => ({
            player: PlayerAdapter.toSimulationPlayer(allPlayers.find(p => p.id === pid)!),
            positionKey: this.findPositionInLineup(homeTactics.lineup, pid)!
        }));

        const awayTacticalPlayers: TacticalPlayer[] = awayStarterIds.map(pid => ({
            player: PlayerAdapter.toSimulationPlayer(allPlayers.find(p => p.id === pid)!),
            positionKey: this.findPositionInLineup(awayTactics.lineup, pid)!
        }));

        const subMap = new Map<string, TacticalPlayer>();
        for (const pid of [...homeSubIds, ...awaySubIds]) {
            const entity = allPlayers.find(p => p.id === pid);
            if (entity) {
                subMap.set(pid, {
                    player: PlayerAdapter.toSimulationPlayer(entity),
                    positionKey: 'SUB'
                });
            }
        }

        const tA = new Team(match.homeTeam!.name, homeTacticalPlayers);
        const tB = new Team(match.awayTeam!.name, awayTacticalPlayers);

        const engine = new MatchEngine(tA, tB, homeInstructions, awayInstructions, subMap);

        // 5. Run Match
        this.logger.log(`[Simulator] Starting engine for ${match.id}`);
        let events = engine.simulateMatch();

        if (match.type === MatchType.TOURNAMENT && engine.homeScore === engine.awayScore) {
            events = engine.simulateExtraTime();
            if (engine.homeScore === engine.awayScore) {
                events = engine.simulatePenaltyShootout();
            }
        }

        // 6. Persist Results
        await this.dataSource.transaction(async (manager) => {
            // Update Match
            match.homeScore = engine.homeScore;
            match.awayScore = engine.awayScore;
            match.status = MatchStatus.COMPLETED;
            match.simulationCompletedAt = new Date();
            await manager.save(match);

            // Save Events
            const eventEntities = events.map(e => manager.create(MatchEventEntity, {
                matchId: match.id,
                minute: e.minute,
                second: 0,
                type: this.mapEventType(e.type),
                typeName: e.type,
                teamId: e.teamName === match.homeTeam!.name ? match.homeTeamId : (e.teamName === match.awayTeam!.name ? match.awayTeamId : null),
                playerId: e.playerId || null,
                data: e.data || null
            }));
            await manager.save(eventEntities);

            // Save Stats (Simplified)
            const calculateStats = (teamName: string, teamId: string) => {
                const goals = events.filter(e => e.type === 'goal' && e.teamName === teamName).length;
                const misses = events.filter(e => e.type === 'miss' && e.teamName === teamName).length;
                const savesByOpponent = events.filter(e => e.type === 'save' && e.teamName !== teamName).length;

                return manager.create(MatchTeamStatsEntity, {
                    matchId: match.id,
                    teamId,
                    possessionPercentage: 50,
                    shots: goals + misses + savesByOpponent,
                    shotsOnTarget: goals + savesByOpponent,
                    corners: events.filter(e => e.type === 'corner' && e.teamName === teamName).length,
                    fouls: events.filter(e => e.type === 'foul' && e.teamName === teamName).length,
                    yellowCards: events.filter(e => e.type === 'yellow_card' && e.teamName === teamName).length,
                    redCards: events.filter(e => e.type === 'red_card' && e.teamName === teamName).length,
                });
            };

            await manager.save([
                calculateStats(match.homeTeam!.name, match.homeTeamId),
                calculateStats(match.awayTeam!.name, match.awayTeamId)
            ]);
        });
    }

    private mapEventType(type: string): number {
        const mapping: Record<string, number> = {
            'kickoff': 0, 'goal': 1, 'shot': 3, 'miss': 3, 'save': 4,
            'yellow_card': 5, 'red_card': 6, 'substitution': 7, 'foul': 9,
            'offside': 10, 'corner': 11, 'penalty_goal': 12, 'penalty_miss': 13,
            'full_time': 14, 'turnover': 20, 'snapshot': 21
        };
        return mapping[type] || 99;
    }

    private async handleForfeit(match: MatchEntity, homeForfeit: boolean, awayForfeit: boolean) {
        match.homeScore = homeForfeit ? 0 : 3;
        match.awayScore = awayForfeit ? 0 : 3;
        match.status = MatchStatus.COMPLETED;
        match.simulationCompletedAt = new Date();
        await this.matchRepository.save(match);
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(`Job ${job.id} failed: ${error.message}`);
    }
}
