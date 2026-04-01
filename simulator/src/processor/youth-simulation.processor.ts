import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
    YouthMatchEntity,
    YouthMatchEventEntity,
    YouthMatchTacticsEntity,
    YouthMatchStatus,
    YouthPlayerEntity,
    YouthTeamEntity,
    GAME_SETTINGS,
    MatchPhase,
    MatchLane,
    toSimulationYouthPlayer,
    MatchEventType,
} from '@goalxi/database';
import { MatchEngine, MatchEvent } from '../engine/match.engine';
import { Team } from '../engine/classes/Team';
import { TacticalInstruction, TacticalPlayer } from '../engine/types/simulation.types';

interface YouthSimulationJobData {
    youthMatchId: string;
    homeForfeit?: boolean;
    awayForfeit?: boolean;
}

@Processor('youth-match-simulation')
@Injectable()
export class YouthSimulationProcessor extends WorkerHost {
    private readonly logger = new Logger(YouthSimulationProcessor.name);

    constructor(
        @InjectRepository(YouthMatchEntity)
        private readonly matchRepository: Repository<YouthMatchEntity>,
        @InjectRepository(YouthMatchEventEntity)
        private readonly eventRepository: Repository<YouthMatchEventEntity>,
        @InjectRepository(YouthMatchTacticsEntity)
        private readonly tacticsRepository: Repository<YouthMatchTacticsEntity>,
        @InjectRepository(YouthPlayerEntity)
        private readonly playerRepository: Repository<YouthPlayerEntity>,
        @InjectRepository(YouthTeamEntity)
        private readonly youthTeamRepository: Repository<YouthTeamEntity>,
        private readonly dataSource: DataSource,
    ) {
        super();
    }

    async process(job: Job<YouthSimulationJobData>): Promise<void> {
        const { youthMatchId, homeForfeit, awayForfeit } = job.data;

        this.logger.log(`[YouthSimulator] Processing youth match ${youthMatchId}`);

        const match = await this.matchRepository.findOne({
            where: { id: youthMatchId },
            relations: ['homeYouthTeam', 'awayYouthTeam'],
        });

        if (!match) {
            this.logger.error(`Youth match ${youthMatchId} not found`);
            return;
        }

        if (match.status === YouthMatchStatus.COMPLETED) {
            this.logger.warn(`Youth match ${youthMatchId} already completed.`);
            return;
        }

        if (homeForfeit || awayForfeit) {
            await this.handleForfeit(match, !!homeForfeit, !!awayForfeit);
        } else {
            await this.runSimulation(match);
        }

        this.logger.log(`[YouthSimulator] Completed youth match ${youthMatchId}`);
    }

    private findPositionInLineup(lineup: Record<string, string>, playerId: string): string | undefined {
        return Object.keys(lineup).find(key => lineup[key] === playerId);
    }

    private async runSimulation(match: YouthMatchEntity): Promise<void> {
        // 1. Fetch Tactics
        const homeTactics = await this.tacticsRepository.findOne({
            where: { youthMatchId: match.id, teamId: match.homeYouthTeamId },
        });
        const awayTactics = await this.tacticsRepository.findOne({
            where: { youthMatchId: match.id, teamId: match.awayYouthTeamId },
        });

        if (!homeTactics || !awayTactics) {
            throw new Error(`Youth tactics missing for match ${match.id}`);
        }

        // 2. Fetch Youth Teams (no bench config for youth teams)
        const [homeTeamEntity, awayTeamEntity] = await Promise.all([
            this.youthTeamRepository.findOne({ where: { id: match.homeYouthTeamId as any } }),
            this.youthTeamRepository.findOne({ where: { id: match.awayYouthTeamId as any } }),
        ]);

        // 3. Fetch Players
        const homeStarterIds = Object.values(homeTactics.lineup).filter(id => typeof id === 'string');
        const awayStarterIds = Object.values(awayTactics.lineup).filter(id => typeof id === 'string');
        const homeSubIds = (homeTactics.substitutions || []).map(s => s.in);
        const awaySubIds = (awayTactics.substitutions || []).map(s => s.in);

        const allPlayerIds = [...homeStarterIds, ...awayStarterIds, ...homeSubIds, ...awaySubIds];
        const allPlayers = await this.playerRepository.find({
            where: { id: In(allPlayerIds) },
        });

        // 4. Map Instructions
        const mapInstructions = (tactics: YouthMatchTacticsEntity): TacticalInstruction[] => {
            const results: TacticalInstruction[] = [];
            if (tactics.substitutions) {
                for (const s of tactics.substitutions) {
                    results.push({
                        minute: s.minute,
                        type: 'swap',
                        playerId: s.out,
                        newPlayerId: s.in,
                        newPosition: this.findPositionInLineup(tactics.lineup, s.out) || 'CF',
                    });
                }
            }
            if (tactics.instructions) {
                if (Array.isArray((tactics.instructions as any).positionSwaps)) {
                    for (const ps of (tactics.instructions as any).positionSwaps) {
                        results.push({
                            minute: ps.minute,
                            type: 'position_swap',
                            playerId: ps.playerA,
                            newPlayerId: ps.playerB,
                            newPosition: 'SWAP',
                        });
                    }
                }
                if (Array.isArray((tactics.instructions as any).moves)) {
                    for (const m of (tactics.instructions as any).moves) {
                        results.push({
                            minute: m.minute,
                            type: 'move',
                            playerId: m.player,
                            newPosition: m.position,
                        });
                    }
                }
            }
            return results;
        };

        const homeInstructions = mapInstructions(homeTactics);
        const awayInstructions = mapInstructions(awayTactics);

        // 5. Setup Engine Teams
        const homePlayerIds = new Set(allPlayers.map(p => p.id));
        const validHomeIds = homeStarterIds.filter(pid => (pid as any) in homePlayerIds);
        const validAwayIds = awayStarterIds.filter(pid => (pid as any) in homePlayerIds);

        const homeTacticalPlayers: TacticalPlayer[] = validHomeIds.map(pid => ({
            player: toSimulationYouthPlayer(allPlayers.find(p => p.id === pid)!),
            positionKey: this.findPositionInLineup(homeTactics.lineup, pid) ?? 'ST',
        }));

        const awayTacticalPlayers: TacticalPlayer[] = validAwayIds.map(pid => ({
            player: toSimulationYouthPlayer(allPlayers.find(p => p.id === pid)!),
            positionKey: this.findPositionInLineup(awayTactics.lineup, pid) ?? 'ST',
        }));

        const subMap = new Map<string, TacticalPlayer>();
        for (const pid of [...homeSubIds, ...awaySubIds]) {
            const entity = allPlayers.find(p => p.id === pid);
            if (entity) {
                subMap.set(pid, {
                    player: toSimulationYouthPlayer(entity),
                    positionKey: 'SUB',
                });
            }
        }

        // Youth teams have no bench config and no doctor, use defaults
        const tA = new Team(match.homeYouthTeam!.name, homeTacticalPlayers, 0);
        const tB = new Team(match.awayYouthTeam!.name, awayTacticalPlayers, 0);

        const engine = new MatchEngine(tA, tB, homeInstructions, awayInstructions, subMap, null, null);

        // 6. Run Match
        this.logger.log(`[YouthSimulator] Starting engine for ${match.id}`);
        let events: MatchEvent[];
        try {
            events = engine.simulateMatch();
        } catch (err) {
            this.logger.error(`[YouthSimulator] simulateMatch crashed for match ${match.id}: ${(err as Error).message}`, (err as Error).stack);
            throw err;
        }

        // Generate injury time
        const firstHalfInjuryTime = Math.floor(Math.random() * (GAME_SETTINGS.MATCH_INJURY_TIME_MAX - GAME_SETTINGS.MATCH_INJURY_TIME_MIN + 1)) + GAME_SETTINGS.MATCH_INJURY_TIME_MIN;
        const secondHalfInjuryTime = Math.floor(Math.random() * (GAME_SETTINGS.MATCH_INJURY_TIME_MAX - GAME_SETTINGS.MATCH_INJURY_TIME_MIN + 1)) + GAME_SETTINGS.MATCH_INJURY_TIME_MIN;

        match.firstHalfInjuryTime = firstHalfInjuryTime;
        match.secondHalfInjuryTime = secondHalfInjuryTime;

        // Check if extra time is needed
        if (match.requiresWinner && engine.homeScore === engine.awayScore) {
            this.logger.log(`[YouthSimulator] Match ${match.id} is tied and requires winner - playing extra time`);
            try {
                events = engine.simulateExtraTime();
            } catch (err) {
                this.logger.error(`[YouthSimulator] simulateExtraTime crashed for match ${match.id}: ${(err as Error).message}`, (err as Error).stack);
                throw err;
            }
            match.hasExtraTime = true;

            const etFirstHalfInjury = Math.floor(Math.random() * (GAME_SETTINGS.MATCH_INJURY_TIME_MAX - GAME_SETTINGS.MATCH_INJURY_TIME_MIN + 1)) + GAME_SETTINGS.MATCH_INJURY_TIME_MIN;
            const etSecondHalfInjury = Math.floor(Math.random() * (GAME_SETTINGS.MATCH_INJURY_TIME_MAX - GAME_SETTINGS.MATCH_INJURY_TIME_MIN + 1)) + GAME_SETTINGS.MATCH_INJURY_TIME_MIN;
            match.extraTimeFirstHalfInjury = etFirstHalfInjury;
            match.extraTimeSecondHalfInjury = etSecondHalfInjury;

            if (engine.homeScore === engine.awayScore) {
                this.logger.log(`[YouthSimulator] Still tied after extra time - penalty shootout`);
                try {
                    events = engine.simulatePenaltyShootout();
                } catch (err) {
                    this.logger.error(`[YouthSimulator] simulatePenaltyShootout crashed for match ${match.id}: ${(err as Error).message}`, (err as Error).stack);
                    throw err;
                }
                match.hasPenaltyShootout = true;
            }
        }

        // 7. Calculate Event Scheduled Times
        const matchStartTime = new Date(match.scheduledAt);
        const matchStartTimeUTC = new Date(matchStartTime.toISOString());

        this.logger.log(
            `[YouthSimulator] Calculating event scheduled times (match starts: ${matchStartTimeUTC.toISOString()})` +
            `  1st half injury time: ${firstHalfInjuryTime}min, 2nd half injury time: ${secondHalfInjuryTime}min`
        );

        for (const event of events) {
            const eventMinute = event.minute;
            let realWorldOffset = 0;

            const isSecondHalfKickoff = eventMinute === 45 &&
                event.type === 'kickoff' &&
                event.data?.period === 'second_half';
            const isExtraTimeKickoff = eventMinute === 90 &&
                event.type === 'kickoff' &&
                event.data?.period === 'extra_time';
            const isExtraTimeSecondHalfKickoff = eventMinute === 105 &&
                event.type === 'kickoff' &&
                event.data?.period === 'extra_time_second_half';

            if (eventMinute < 45) {
                realWorldOffset = eventMinute * 60 * 1000;
            } else if (eventMinute === 45 && !isSecondHalfKickoff) {
                realWorldOffset = 45 * 60 * 1000;
            } else if (isSecondHalfKickoff) {
                realWorldOffset = (45 * 60 * 1000) + (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000);
            } else if (eventMinute <= 90) {
                realWorldOffset = eventMinute * 60 * 1000 + (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000);
            } else if (match.hasExtraTime) {
                if (isExtraTimeKickoff) {
                    realWorldOffset = (90 * 60 * 1000) + (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000);
                } else if (eventMinute < 105) {
                    realWorldOffset = (90 * 60 * 1000) + (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000) + ((eventMinute - 90) * 60 * 1000);
                } else if (isExtraTimeSecondHalfKickoff) {
                    realWorldOffset = (90 * 60 * 1000) +
                        (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000) +
                        (15 * 60 * 1000) +
                        (GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES * 60 * 1000);
                } else {
                    realWorldOffset = (90 * 60 * 1000) +
                        (GAME_SETTINGS.MATCH_HALF_TIME_MINUTES * 60 * 1000) +
                        (15 * 60 * 1000) +
                        (GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES * 60 * 1000) +
                        ((eventMinute - 105) * 60 * 1000);
                }
            }

            event.eventScheduledTime = new Date(matchStartTimeUTC.getTime() + realWorldOffset);
        }

        const lastEvent = events[events.length - 1];
        const totalDuration = lastEvent?.eventScheduledTime
            ? (lastEvent.eventScheduledTime.getTime() - matchStartTimeUTC.getTime()) / (60 * 1000)
            : 0;

        this.logger.log(
            `[YouthSimulator] Events will be revealed from ${matchStartTimeUTC.toISOString()} ` +
            `to ${lastEvent?.eventScheduledTime?.toISOString() || 'unknown'}\n` +
            `  Total events: ${events.length}, Real-world duration: ~${Math.ceil(totalDuration)} minutes`
        );

        // 8. Persist Results
        await this.dataSource.transaction(async (manager) => {
            match.homeScore = engine.homeScore;
            match.awayScore = engine.awayScore;
            match.simulationCompletedAt = new Date();
            match.actualEndTime = lastEvent?.eventScheduledTime || new Date();
            await manager.save(match);

            // Save Events
            await manager.createQueryBuilder()
                .insert()
                .into(YouthMatchEventEntity)
                .values(events.map(e => {
                    const playerName = e.playerId ? allPlayers.find(p => p.id === e.playerId)?.name : undefined;
                    const assistName = e.relatedPlayerId ? allPlayers.find(p => p.id === e.relatedPlayerId)?.name : undefined;
                    return {
                        youthMatchId: match.id,
                        minute: e.minute,
                        second: 0,
                        type: this.mapEventType(e.type),
                        typeName: e.type,
                        teamId: e.teamName === match.homeYouthTeam!.name ? match.homeYouthTeamId : (e.teamName === match.awayYouthTeam!.name ? match.awayYouthTeamId : null),
                        playerId: e.playerId || null,
                        relatedPlayerId: e.relatedPlayerId || null,
                        phase: (e.phase as MatchPhase) || MatchPhase.FIRST_HALF,
                        lane: e.lane as any || null,
                        isHome: e.teamName ? e.teamName === match.homeYouthTeam!.name : null,
                        data: { ...e.data, playerName, assistName },
                        eventScheduledTime: e.eventScheduledTime,
                        isRevealed: false,
                    } as any;
                }))
                .execute();
        });
    }

    private mapEventType(type: string): number {
        const mapping: Record<string, number> = {
            'kickoff': 1,
            'goal': 2,
            'shot_on_target': 3,
            'save': 8,
            'miss': 4,
            'turnover': 5,
            'foul': 9,
            'yellow_card': 10,
            'red_card': 11,
            'substitution': 12,
            'half_time': 13,
            'second_half': 23,
            'full_time': 14,
            'injury': 15,
            'offside': 16,
            'corner': 17,
            'free_kick': 18,
            'penalty_goal': 19,
            'penalty_miss': 31,
            'snapshot': 21,
            'tactical_change': 27,
        };
        return mapping[type] ?? 27;
    }

    private async handleForfeit(match: YouthMatchEntity, homeForfeit: boolean, awayForfeit: boolean) {
        match.homeScore = homeForfeit ? 0 : 3;
        match.awayScore = awayForfeit ? 0 : 3;
        match.status = YouthMatchStatus.COMPLETED;
        match.simulationCompletedAt = new Date();
        await this.matchRepository.save(match);
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        this.logger.log(`Youth Job ${job.id} completed successfully`);
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(`Youth Job ${job.id} failed: ${error.message}`);
    }
}
