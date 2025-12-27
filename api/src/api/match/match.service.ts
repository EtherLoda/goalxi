import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Inject,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
    GAME_SETTINGS,
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
        @InjectQueue('match-simulation')
        private readonly simulationQueue: Queue,
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

        const dtos = matches.map((match) => this.mapToResDto(match));

        const matchIds = matches.map((m) => m.id);
        if (matchIds.length > 0) {
            let tactics;

            // Optimize: If season is provided, query all tactics for that season at once
            // instead of just the current page's matchIds
            if (season) {
                const tacticsQuery = this.tacticsRepository
                    .createQueryBuilder('tactics')
                    .innerJoin('tactics.match', 'match')
                    .where('match.season = :season', { season })
                    .select(['tactics.matchId', 'tactics.teamId']);

                // Apply additional filters if they exist
                if (leagueId) {
                    let actualLeagueId = leagueId;
                    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                    if (!uuidRegex.test(leagueId)) {
                        const name = leagueId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        const league = await LeagueEntity.findOne({ where: { name } });
                        if (league) {
                            actualLeagueId = league.id;
                        } else {
                            actualLeagueId = '00000000-0000-0000-0000-000000000000';
                        }
                    }
                    tacticsQuery.andWhere('match.leagueId = :leagueId', { leagueId: actualLeagueId });
                }

                if (teamId) {
                    tacticsQuery.andWhere('(match.homeTeamId = :teamId OR match.awayTeamId = :teamId)', { teamId });
                }

                tactics = await tacticsQuery.getMany();
            } else {
                // Fallback to original query if no season filter
                tactics = await this.tacticsRepository.find({
                    where: { matchId: In(matchIds) },
                    select: ['matchId', 'teamId'],
                });
            }

            dtos.forEach((dto) => {
                dto.homeTacticsSet = tactics.some(
                    (t) => t.matchId === dto.id && t.teamId === dto.homeTeamId,
                );
                dto.awayTacticsSet = tactics.some(
                    (t) => t.matchId === dto.id && t.teamId === dto.awayTeamId,
                );
            });
        }

        return {
            data: dtos,
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

    /**
     * Queue a match for simulation
     * @param matchId - The ID of the match to simulate
     * @returns Status of the queued job
     */
    async queueSimulation(matchId: string): Promise<{ status: string; matchId: string }> {
        const match = await this.matchRepository.findOne({
            where: { id: matchId },
            relations: ['homeTeam', 'awayTeam']
        });

        if (!match) {
            throw new NotFoundException(`Match with ID ${matchId} not found`);
        }

        if (match.status === MatchStatus.COMPLETED) {
            throw new BadRequestException('Match is already completed');
        }

        if (match.status === MatchStatus.IN_PROGRESS) {
            throw new BadRequestException('Match simulation is already in progress');
        }

        // Check if both teams have submitted tactics
        const [homeTactics, awayTactics] = await Promise.all([
            this.tacticsRepository.findOne({ where: { matchId, teamId: match.homeTeamId } }),
            this.tacticsRepository.findOne({ where: { matchId, teamId: match.awayTeamId } }),
        ]);

        if (!homeTactics && !awayTactics) {
            throw new BadRequestException(
                `Both teams (${match.homeTeam?.name || 'Home'} and ${match.awayTeam?.name || 'Away'}) need to submit tactics before simulation can start`
            );
        }

        if (!homeTactics) {
            throw new BadRequestException(
                `${match.homeTeam?.name || 'Home team'} needs to submit tactics before simulation can start`
            );
        }

        if (!awayTactics) {
            throw new BadRequestException(
                `${match.awayTeam?.name || 'Away team'} needs to submit tactics before simulation can start`
            );
        }

        // Add job to simulation queue
        await this.simulationQueue.add('simulate', { matchId });

        return { status: 'queued', matchId };
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

        // Check if tactics are already locked
        if (match.tacticsLocked) {
            throw new BadRequestException(
                'Tactics are already locked for this match. The deadline has passed.',
            );
        }

        // Check deadline (30 minutes before kickoff)
        const deadlineMinutes = GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES;
        const deadline = new Date(
            match.scheduledAt.getTime() - deadlineMinutes * 60 * 1000,
        );
        const now = new Date();

        if (now >= deadline) {
            throw new BadRequestException(
                `Tactics submission deadline has passed. Tactics must be submitted at least ${deadlineMinutes} minutes before match start.`,
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
