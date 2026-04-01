import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
    YouthMatchEntity,
    YouthMatchStatus,
    YouthMatchTacticsEntity,
    YouthMatchEventEntity,
    YouthTeamEntity,
    YouthPlayerEntity,
    TeamEntity,
    GAME_SETTINGS,
} from '@goalxi/database';
import { ListYouthMatchesReqDto } from './dto/list-youth-matches.req.dto';
import { YouthMatchResDto, YouthMatchListResDto } from './dto/youth-match.res.dto';
import { SubmitYouthTacticsReqDto } from './dto/submit-youth-tactics.req.dto';
import { YouthTacticsResDto } from './dto/youth-tactics.res.dto';

@Injectable()
export class YouthMatchService {
    constructor(
        @InjectRepository(YouthMatchEntity)
        private readonly matchRepository: Repository<YouthMatchEntity>,
        @InjectRepository(YouthMatchTacticsEntity)
        private readonly tacticsRepository: Repository<YouthMatchTacticsEntity>,
        @InjectRepository(YouthMatchEventEntity)
        private readonly eventRepository: Repository<YouthMatchEventEntity>,
        @InjectRepository(YouthTeamEntity)
        private readonly youthTeamRepository: Repository<YouthTeamEntity>,
        @InjectRepository(YouthPlayerEntity)
        private readonly youthPlayerRepository: Repository<YouthPlayerEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepository: Repository<TeamEntity>,
        private readonly dataSource: DataSource,
    ) {}

    async findAll(filters: ListYouthMatchesReqDto): Promise<YouthMatchListResDto> {
        const {
            youthLeagueId,
            teamId,
            season,
            week,
            status,
            page = 1,
            limit = 20,
        } = filters;

        const query = this.matchRepository
            .createQueryBuilder('match')
            .leftJoinAndSelect('match.homeYouthTeam', 'homeYouthTeam')
            .leftJoinAndSelect('match.awayYouthTeam', 'awayYouthTeam');

        if (youthLeagueId) {
            query.andWhere('match.youthLeagueId = :youthLeagueId', { youthLeagueId });
        }

        if (teamId) {
            query.andWhere(
                '(match.homeYouthTeamId = :teamId OR match.awayYouthTeamId = :teamId)',
                { teamId },
            );
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

        const total = await query.getCount();
        query.orderBy('match.scheduledAt', 'ASC');
        query.skip((page - 1) * limit).take(limit);

        const matches = await query.getMany();

        return {
            items: matches.map((m) => this.mapToResDto(m)),
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }

    async findOne(id: string): Promise<YouthMatchResDto> {
        const match = await this.matchRepository.findOne({
            where: { id },
            relations: ['homeYouthTeam', 'awayYouthTeam'],
        });
        if (!match) {
            throw new NotFoundException(`Youth match with ID ${id} not found`);
        }
        return this.mapToResDto(match);
    }

    async getTactics(
        matchId: string,
        userId?: string,
    ): Promise<{ homeTactics: YouthTacticsResDto | null; awayTactics: YouthTacticsResDto | null }> {
        const match = await this.matchRepository.findOne({ where: { id: matchId } });
        if (!match) {
            throw new NotFoundException(`Youth match with ID ${matchId} not found`);
        }

        const tactics = await this.tacticsRepository.find({
            where: { youthMatchId: matchId },
        });

        const homeTactics = tactics.find((t) => t.teamId === match.homeYouthTeamId);
        const awayTactics = tactics.find((t) => t.teamId === match.awayYouthTeamId);

        return {
            homeTactics: homeTactics ? this.mapTacticsToResDto(homeTactics) : null,
            awayTactics: awayTactics ? this.mapTacticsToResDto(awayTactics) : null,
        };
    }

    async getMatchEvents(matchId: string, userId?: string): Promise<any[]> {
        const match = await this.matchRepository.findOne({ where: { id: matchId } });
        if (!match) {
            throw new NotFoundException(`Youth match with ID ${matchId} not found`);
        }

        const events = await this.eventRepository.find({
            where: { youthMatchId: matchId },
            order: { minute: 'ASC', second: 'ASC' },
        });

        // If user is provided, validate ownership through youth team -> team -> user
        if (userId) {
            const youthTeamIds = [match.homeYouthTeamId, match.awayYouthTeamId];
            const youthTeams = await this.youthTeamRepository.find({
                where: youthTeamIds.map(id => ({ id } as any)),
                relations: ['team'],
            });
            const isOwner = youthTeams.some(yt => yt.team?.userId === userId);
            if (!isOwner) {
                // Filter events to only revealed ones
                return events
                    .filter(e => e.isRevealed)
                    .map(e => this.mapEventToResDto(e));
            }
        }

        return events.map(e => this.mapEventToResDto(e));
    }

    async submitTactics(
        matchId: string,
        youthTeamId: string,
        dto: SubmitYouthTacticsReqDto,
    ): Promise<YouthTacticsResDto> {
        const match = await this.matchRepository.findOne({ where: { id: matchId } });

        if (!match) {
            throw new NotFoundException(`Youth match with ID ${matchId} not found`);
        }

        // Verify youth team is participating
        if (match.homeYouthTeamId !== youthTeamId && match.awayYouthTeamId !== youthTeamId) {
            throw new ForbiddenException('Youth team is not participating in this match');
        }

        // Check if tactics are already locked
        if (match.tacticsLocked) {
            throw new BadRequestException(
                'Tactics are already locked for this match. The deadline has passed.',
            );
        }

        // Check deadline (30 minutes before kickoff)
        const deadlineMinutes = GAME_SETTINGS.MATCH_TACTICS_DEADLINE_MINUTES;
        const deadline = new Date(match.scheduledAt.getTime() - deadlineMinutes * 60 * 1000);
        const now = new Date();

        if (now >= deadline) {
            throw new BadRequestException(
                `Tactics submission deadline has passed. Tactics must be submitted at least ${deadlineMinutes} minutes before match start.`,
            );
        }

        // Get youth team to find parent team for validation
        const youthTeam = await this.youthTeamRepository.findOne({
            where: { id: youthTeamId },
        });
        if (!youthTeam) {
            throw new NotFoundException(`Youth team with ID ${youthTeamId} not found`);
        }

        // Validate lineup - get youth players for this youth team
        const teamPlayers = await this.youthPlayerRepository.find({
            where: { youthTeamId },
            select: ['id', 'isGoalkeeper'],
        });
        const teamPlayerIds = teamPlayers.map((p) => p.id);

        const playerRoles = new Map<string, boolean>();
        teamPlayers.forEach((p) => {
            playerRoles.set(p.id, p.isGoalkeeper);
        });

        // Simple validation: check all lineup player IDs are in the team
        for (const playerId of Object.values(dto.lineup)) {
            if (!teamPlayerIds.includes(playerId)) {
                throw new BadRequestException(
                    `Player ${playerId} is not in the youth team roster`,
                );
            }
        }

        // Check for existing tactics
        let tactics = await this.tacticsRepository.findOne({
            where: { youthMatchId: matchId, teamId: youthTeamId },
        });

        if (tactics) {
            // Update existing
            tactics.formation = dto.formation;
            tactics.lineup = dto.lineup;
            tactics.instructions = dto.instructions || null;
            tactics.substitutions = dto.substitutions || null;
        } else {
            // Create new
            tactics = this.tacticsRepository.create({
                youthMatchId: matchId,
                teamId: youthTeamId,
                formation: dto.formation,
                lineup: dto.lineup,
                instructions: dto.instructions || null,
                substitutions: dto.substitutions || null,
            });
        }

        const savedTactics = await this.tacticsRepository.save(tactics);
        return this.mapTacticsToResDto(savedTactics);
    }

    async validateYouthTeamOwnership(userId: string, youthTeamId: string): Promise<boolean> {
        const youthTeam = await this.youthTeamRepository.findOne({
            where: { id: youthTeamId },
            relations: ['team'],
        });
        if (!youthTeam || !youthTeam.team) {
            throw new ForbiddenException('Youth team not found');
        }
        if (youthTeam.team.userId !== userId) {
            throw new ForbiddenException('User does not own this youth team');
        }
        return true;
    }

    private mapToResDto(match: YouthMatchEntity): YouthMatchResDto {
        return {
            id: match.id,
            youthLeagueId: match.youthLeagueId,
            season: match.season,
            week: match.week,
            homeYouthTeamId: match.homeYouthTeamId,
            awayYouthTeamId: match.awayYouthTeamId,
            homeScore: match.homeScore,
            awayScore: match.awayScore,
            status: match.status,
            scheduledAt: match.scheduledAt,
            simulationCompletedAt: match.simulationCompletedAt,
            tacticsLocked: match.tacticsLocked,
            homeForfeit: match.homeForfeit,
            awayForfeit: match.awayForfeit,
            startedAt: match.startedAt,
            completedAt: match.completedAt,
            homeYouthTeam: match.homeYouthTeam
                ? {
                      id: match.homeYouthTeam.id,
                      name: match.homeYouthTeam.name,
                  }
                : undefined,
            awayYouthTeam: match.awayYouthTeam
                ? {
                      id: match.awayYouthTeam.id,
                      name: match.awayYouthTeam.name,
                  }
                : undefined,
        };
    }

    private mapTacticsToResDto(tactics: YouthMatchTacticsEntity): YouthTacticsResDto {
        return {
            id: tactics.id,
            youthMatchId: tactics.youthMatchId,
            teamId: tactics.teamId,
            formation: tactics.formation,
            lineup: tactics.lineup,
            instructions: tactics.instructions || null,
            substitutions: tactics.substitutions || null,
            createdAt: tactics.createdAt,
        };
    }

    private mapEventToResDto(event: YouthMatchEventEntity): any {
        return {
            id: event.id,
            youthMatchId: event.youthMatchId,
            minute: event.minute,
            second: event.second,
            type: event.type,
            typeName: event.typeName,
            teamId: event.teamId,
            playerId: event.playerId,
            relatedPlayerId: event.relatedPlayerId,
            phase: event.phase,
            lane: event.lane,
            isHome: event.isHome,
            data: event.data,
            eventScheduledTime: event.eventScheduledTime,
            isRevealed: event.isRevealed,
        };
    }
}
