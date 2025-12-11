import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import {
    MatchEntity,
    MatchStatus,
    MatchTacticsEntity,
    TacticsPresetEntity,
    TeamEntity,
    PlayerEntity,
    MatchEventEntity,
    MatchTeamStatsEntity,
    LeagueEntity,
} from '@goalxi/database';
import { Uuid } from '@/common/types/common.type';
import { Repository, DataSource, In } from 'typeorm';
import { CreateMatchReqDto } from './dto/create-match.req.dto';
import { UpdateMatchReqDto } from './dto/update-match.req.dto';
import { ListMatchesReqDto } from './dto/list-matches.req.dto';
import { MatchResDto } from './dto/match.res.dto';
import { MatchListResDto } from './dto/match-list.res.dto';
import { SubmitTacticsReqDto } from './dto/submit-tactics.req.dto';
import { TacticsResDto } from './dto/tactics.res.dto';
import { LineupValidator } from './validators/lineup.validator';
import { MatchEngine } from './engine/match.engine';
import { MatchEventType } from './engine/types';
import { TacticalPlayer } from './engine/types/simulation.types';
import { Team } from './engine/classes/Team';
import { PlayerAdapter } from './engine/utils/player-adapter';

@Injectable()
export class MatchService {
    constructor(
        @InjectRepository(MatchEntity)
        private readonly matchRepository: Repository<MatchEntity>,
        @InjectRepository(MatchTacticsEntity)
        private readonly tacticsRepository: Repository<MatchTacticsEntity>,
        @InjectRepository(TacticsPresetEntity)
        private readonly presetRepository: Repository<TacticsPresetEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
        @InjectRepository(PlayerEntity)
        private readonly playerRepository: Repository<PlayerEntity>,
        @InjectRepository(MatchEventEntity)
        private readonly eventRepository: Repository<MatchEventEntity>,
        @InjectRepository(MatchTeamStatsEntity)
        private readonly statsRepository: Repository<MatchTeamStatsEntity>,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        private readonly dataSource: DataSource,
    ) { }

    async findAll(filters: ListMatchesReqDto): Promise<MatchListResDto> {
        const { leagueId, teamId, season, week, status, type, page = 1, limit = 20 } = filters;

        const query = this.matchRepository
            .createQueryBuilder('match')
            .leftJoinAndSelect('match.homeTeam', 'homeTeam')
            .leftJoinAndSelect('match.awayTeam', 'awayTeam')
            .leftJoinAndSelect('match.league', 'league');

        if (leagueId) {
            let actualLeagueId = leagueId;
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(leagueId)) {
                const name = leagueId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                const league = await LeagueEntity.findOne({ where: { name } });
                if (league) {
                    actualLeagueId = league.id;
                } else {
                    // Start of dummy UUID to ensure no results found if slug is invalid
                    actualLeagueId = '00000000-0000-0000-0000-000000000000';
                }
            }
            query.andWhere('match.leagueId = :leagueId', { leagueId: actualLeagueId });
        }

        if (teamId) {
            query.andWhere('(match.homeTeamId = :teamId OR match.awayTeamId = :teamId)', {
                teamId,
            });
        }

        if (season) {
            query.andWhere('match.season = :season', { season });
        }

        if (week) {
            query.andWhere('match.week = :week', { week });
        }

        if (status) {
            query.andWhere('match.status = :status', { status });
        }

        if (type) {
            query.andWhere('match.type = :type', { type });
        }

        query.orderBy('match.scheduledAt', 'DESC');

        const [matches, total] = await query
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        return {
            data: matches.map((match) => this.mapToResDto(match)),
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: string): Promise<MatchResDto> {
        const cacheKey = `match:${id}`;
        const cachedMatch = await this.cacheManager.get<MatchResDto>(cacheKey);

        if (cachedMatch) {
            return cachedMatch;
        }

        const match = await this.matchRepository.findOne({
            where: { id },
            relations: ['homeTeam', 'awayTeam', 'league'],
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        const result = this.mapToResDto(match);

        // Cache completed matches for 1 hour, others for 1 minute
        const ttl = match.status === MatchStatus.COMPLETED ? 3600000 : 60000;
        await this.cacheManager.set(cacheKey, result, ttl);

        return result;
    }

    async create(dto: CreateMatchReqDto): Promise<MatchResDto> {
        // Validate teams exist and are different
        if (dto.homeTeamId === dto.awayTeamId) {
            throw new BadRequestException('Home and away teams must be different');
        }

        const [homeTeam, awayTeam] = await Promise.all([
            this.teamRepository.findOne({ where: { id: dto.homeTeamId as any } }),
            this.teamRepository.findOne({ where: { id: dto.awayTeamId as any } }),
        ]);

        if (!homeTeam) {
            throw new NotFoundException(`Home team with ID ${dto.homeTeamId} not found`);
        }

        if (!awayTeam) {
            throw new NotFoundException(`Away team with ID ${dto.awayTeamId} not found`);
        }

        // Validate scheduled time is in the future
        const scheduledAt = new Date(dto.scheduledAt);
        if (scheduledAt <= new Date()) {
            throw new BadRequestException('Scheduled time must be in the future');
        }

        const match = this.matchRepository.create({
            ...dto,
            scheduledAt,
            status: MatchStatus.SCHEDULED,
        });

        const savedMatch = await this.matchRepository.save(match);

        return this.findOne(savedMatch.id);
    }

    async update(id: string, dto: UpdateMatchReqDto): Promise<MatchResDto> {
        const match = await this.matchRepository.findOne({ where: { id } });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        Object.assign(match, dto);

        if (dto.scheduledAt) {
            match.scheduledAt = new Date(dto.scheduledAt);
        }

        await this.matchRepository.save(match);

        return this.findOne(id);
    }

    async delete(id: string): Promise<void> {
        const match = await this.matchRepository.findOne({ where: { id } });

        if (!match) {
            throw new NotFoundException(`Match with ID ${id} not found`);
        }

        if (match.status !== MatchStatus.SCHEDULED) {
            throw new BadRequestException('Can only delete scheduled matches');
        }

        await this.matchRepository.remove(match);
    }

    async getTactics(
        matchId: string,
        userId: string,
    ): Promise<{ homeTactics: TacticsResDto | null; awayTactics: TacticsResDto | null }> {
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        const [homeTactics, awayTactics] = await Promise.all([
            this.tacticsRepository.findOne({
                where: { matchId, teamId: match.homeTeamId },
            }),
            this.tacticsRepository.findOne({
                where: { matchId, teamId: match.awayTeamId },
            }),
        ]);

        // If match is completed, return both tactics
        if (match.status === MatchStatus.COMPLETED) {
            return {
                homeTactics: homeTactics ? this.mapTacticsToResDto(homeTactics) : null,
                awayTactics: awayTactics ? this.mapTacticsToResDto(awayTactics) : null,
            };
        }

        // Otherwise, only return user's own team tactics
        // TODO: Implement user-team relationship check
        // For now, return both (will be fixed when auth is implemented)
        return {
            homeTactics: homeTactics ? this.mapTacticsToResDto(homeTactics) : null,
            awayTactics: awayTactics ? this.mapTacticsToResDto(awayTactics) : null,
        };
    }

    async submitTactics(
        matchId: string,
        teamId: string,
        dto: SubmitTacticsReqDto,
    ): Promise<TacticsResDto> {
        const match = await this.matchRepository.findOne({ where: { id: matchId } });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        // Verify team is participating
        if (match.homeTeamId !== teamId && match.awayTeamId !== teamId) {
            throw new ForbiddenException('Team is not participating in this match');
        }

        // Check deadline (30 minutes before kickoff)
        const deadline = new Date(match.scheduledAt.getTime() - 30 * 60 * 1000);
        if (new Date() > deadline) {
            throw new BadRequestException(
                'Tactics submission deadline has passed (30 minutes before kickoff)',
            );
        }

        // If presetId provided, load preset
        let lineup = dto.lineup;
        let formation = dto.formation;
        let instructions = dto.instructions;
        let substitutions = dto.substitutions;

        if (dto.presetId) {
            const preset = await this.presetRepository.findOne({
                where: { id: dto.presetId, teamId },
            });

            if (!preset) {
                throw new NotFoundException(`Preset with ID ${dto.presetId} not found`);
            }

            // Merge preset with provided data (provided data takes precedence)
            lineup = dto.lineup || preset.lineup;
            formation = dto.formation || preset.formation;
            instructions = dto.instructions || preset.instructions;
            substitutions = dto.substitutions || preset.substitutions;
        }

        // Validate lineup
        const teamPlayers = await this.playerRepository.find({
            where: { teamId },
            select: ['id'],
        });
        const teamPlayerIds = teamPlayers.map((p) => p.id);

        const validation = LineupValidator.validate(lineup, teamPlayerIds);
        if (!validation.valid) {
            throw new BadRequestException(validation.errors.join(', '));
        }

        // Check for existing tactics
        let tactics = await this.tacticsRepository.findOne({
            where: { matchId, teamId },
        });

        if (tactics) {
            // Update existing
            tactics.formation = formation;
            tactics.lineup = lineup;
            tactics.instructions = instructions || null;
            tactics.substitutions = substitutions || null;
            tactics.presetId = dto.presetId || null;
            tactics.submittedAt = new Date();
        } else {
            // Create new
            tactics = this.tacticsRepository.create({
                matchId,
                teamId,
                formation,
                lineup,
                instructions: instructions || null,
                substitutions: substitutions || null,
                presetId: dto.presetId || null,
                submittedAt: new Date(),
            });
        }

        const savedTactics = await this.tacticsRepository.save(tactics);

        return this.mapTacticsToResDto(savedTactics);
    }

    async validateTeamOwnership(userId: string, teamId: string): Promise<boolean> {
        const team = await this.teamRepository.findOne({ where: { id: teamId as any, userId } });
        if (!team) {
            throw new ForbiddenException('User does not own this team');
        }
        return true;
    }

    async simulateMatch(matchId: string): Promise<void> {
        const match = await this.matchRepository.findOne({ where: { id: matchId } });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        if (match.status !== MatchStatus.SCHEDULED) {
            throw new BadRequestException('Match must be in SCHEDULED status to simulate');
        }

        // Get tactics for both teams
        const [homeTactics, awayTactics] = await Promise.all([
            this.tacticsRepository.findOne({ where: { matchId, teamId: match.homeTeamId } }),
            this.tacticsRepository.findOne({ where: { matchId, teamId: match.awayTeamId } }),
        ]);

        if (!homeTactics || !awayTactics) {
            throw new BadRequestException('Both teams must submit tactics before simulation');
        }

        // Fetch Players for Home Team
        const homeLineup = homeTactics.lineup || {};
        const homePlayerIds = Object.values(homeLineup);

        let homePlayers: PlayerEntity[] = [];
        if (homePlayerIds.length > 0) {
            homePlayers = await this.playerRepository.findBy({ id: In(homePlayerIds) });
        }
        const homePlayerMap = new Map(homePlayers.map((p) => [p.id, p]));

        const homeTacticalPlayers: TacticalPlayer[] = Object.entries(homeLineup).map(([position, playerId]) => {
            const entity = homePlayerMap.get(playerId as unknown as Uuid);
            if (!entity) throw new Error(`Player ${playerId} not found`);
            return {
                player: PlayerAdapter.toSimulationPlayer(entity),
                positionKey: position,
            };
        });

        // Fetch Players for Away Team
        const awayLineup = awayTactics.lineup || {};
        const awayPlayerIds = Object.values(awayLineup);

        let awayPlayers: PlayerEntity[] = [];
        if (awayPlayerIds.length > 0) {
            awayPlayers = await this.playerRepository.findBy({ id: In(awayPlayerIds) });
        }
        const awayPlayerMap = new Map(awayPlayers.map((p) => [p.id, p]));

        const awayTacticalPlayers: TacticalPlayer[] = Object.entries(awayLineup).map(([position, playerId]) => {
            const entity = awayPlayerMap.get(playerId as unknown as Uuid);
            if (!entity) throw new Error(`Player ${playerId} not found`);
            return {
                player: PlayerAdapter.toSimulationPlayer(entity),
                positionKey: position,
            };
        });

        // Setup Teams
        // Reload match with team relations to get names
        const matchWithTeams = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam'],
        });

        if (!matchWithTeams) throw new NotFoundException('Match not found during team setup');

        // Re-instantiate Teams with Names
        const finalHomeTeam = new Team(matchWithTeams.homeTeam.name, homeTacticalPlayers);
        const finalAwayTeam = new Team(matchWithTeams.awayTeam.name, awayTacticalPlayers);

        // Run simulation
        const engine = new MatchEngine(finalHomeTeam, finalAwayTeam);
        let events = engine.simulateMatch();

        // Extra Time Check
        if (match.hasExtraTime) {
            const homeGoals = events.filter((e) => e.type === 'goal' && e.teamName === finalHomeTeam.name).length;
            const awayGoals = events.filter((e) => e.type === 'goal' && e.teamName === finalAwayTeam.name).length;

            if (homeGoals === awayGoals) {
                const etEvents = engine.simulateExtraTime();
                events = [...events, ...etEvents];
            }
        }

        // Calculate Stats (Post-processing)
        const calculateStats = (teamName: string) => {
            const teamEvents = events.filter((e) => e.teamName === teamName);
            const goals = teamEvents.filter((e) => e.type === 'goal').length;
            // Poss, Threat, Finish were tracked internally but removed.
            // We only have Events now: goal, miss, save, turnover, advance.
            // We can infer some stats or set placeholders.
            const shots = events.filter((e) => e.teamName === teamName && (e.type === 'goal' || e.type === 'save' || e.type === 'miss')).length;
            // Event description usually says "Shot by X saved by Y". teamName in event is Possession Team.

            return {
                possession: 50, // improved logic needed later
                shots,
                shotsOnTarget: shots - events.filter((e) => e.type === 'miss' && e.teamName === teamName).length,
                passes: 0,
                tackles: 0,
                fouls: 0,
                corners: 0,
                offsides: 0,
                yellowCards: 0,
                redCards: 0,
                score: goals,
            };
        };

        const homeStatsRaw = calculateStats(finalHomeTeam.name);
        const awayStatsRaw = calculateStats(finalAwayTeam.name);

        // Save results in a transaction
        await this.dataSource.transaction(async (manager) => {
            // Update match
            match.homeScore = homeStatsRaw.score;
            match.awayScore = awayStatsRaw.score;
            match.status = MatchStatus.COMPLETED;
            match.simulationCompletedAt = new Date();
            await manager.save(match);

            // Save events
            const eventEntities: MatchEventEntity[] = [];
            for (const event of events) {
                const mappedType = this.mapEventType(event.type);
                if (mappedType) {
                    eventEntities.push(
                        manager.create(MatchEventEntity, {
                            matchId,
                            minute: event.minute,
                            second: 0,
                            type: mappedType,
                            typeName: MatchEventType[mappedType],
                            teamId: event.teamId || null,
                            playerId: event.playerId || null,
                            data: event.data ? { ...event.data, description: event.description } : { description: event.description },
                        }),
                    );
                }
            }
            await manager.save(eventEntities);

            // Save team stats
            const homeStats = manager.create(MatchTeamStatsEntity, {
                matchId,
                teamId: match.homeTeamId,
                ...homeStatsRaw,
                passAccuracy: 0,
            });

            const awayStats = manager.create(MatchTeamStatsEntity, {
                matchId,
                teamId: match.awayTeamId,
                ...awayStatsRaw,
                passAccuracy: 0,
            });

            await manager.save([homeStats, awayStats]);
        });
    }

    private mapEventType(engineType: string): MatchEventType | null {
        switch (engineType) {
            case 'goal': return MatchEventType.GOAL;
            case 'save': return MatchEventType.SAVE;
            case 'miss': return MatchEventType.SHOT_OFF_TARGET;
            case 'turnover': return MatchEventType.INTERCEPTION; // Proxied for now
            case 'snapshot': return MatchEventType.SNAPSHOT;
            default: return null; // Skip advance/others
        }
    }

    private mapToResDto(match: MatchEntity): MatchResDto {
        return {
            id: match.id,
            leagueId: match.leagueId,
            season: match.season,
            week: match.week,
            homeTeamId: match.homeTeamId,
            awayTeamId: match.awayTeamId,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            status: match.status,
            type: match.type,
            scheduledAt: match.scheduledAt,
            simulationCompletedAt: match.simulationCompletedAt,
            homeTeam: {
                id: match.homeTeam.id,
                name: match.homeTeam.name,
                logo: match.homeTeam.logoUrl || null,
            },
            awayTeam: {
                id: match.awayTeam.id,
                name: match.awayTeam.name,
                logo: match.awayTeam.logoUrl || null,
            },
            // Phase 4 fields
            tacticsLocked: match.tacticsLocked,
            homeForfeit: match.homeForfeit,
            awayForfeit: match.awayForfeit,
            firstHalfInjuryTime: match.firstHalfInjuryTime,
            secondHalfInjuryTime: match.secondHalfInjuryTime,
            hasExtraTime: match.hasExtraTime,
        };
    }

    private mapTacticsToResDto(tactics: MatchTacticsEntity): TacticsResDto {
        return {
            id: tactics.id,
            matchId: tactics.matchId,
            teamId: tactics.teamId,
            formation: tactics.formation,
            lineup: tactics.lineup,
            instructions: tactics.instructions,
            substitutions: tactics.substitutions,
            submittedAt: tactics.submittedAt,
            presetId: tactics.presetId,
        };
    }
}
