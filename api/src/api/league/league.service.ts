import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { paginate } from '@/utils/offset-pagination';
import { Injectable, NotFoundException } from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { CreateLeagueReqDto } from './dto/create-league.req.dto';
import { LeagueResDto } from './dto/league.res.dto';
import { ListLeagueReqDto } from './dto/list-league.req.dto';
import { UpdateLeagueReqDto } from './dto/update-league.req.dto';
import { LeagueEntity, LeagueStandingEntity } from '@goalxi/database';
import { LeagueStandingResDto } from './dto/league-standing.res.dto';

@Injectable()
export class LeagueService {
    constructor() { }

    async findMany(
        reqDto: ListLeagueReqDto,
    ): Promise<OffsetPaginatedDto<LeagueResDto>> {
        const query = LeagueEntity.createQueryBuilder('league').orderBy(
            'league.createdAt',
            'DESC',
        );
        const [leagues, metaDto] = await paginate<LeagueEntity>(query, reqDto, {
            skipCount: false,
            takeAll: false,
        });

        return new OffsetPaginatedDto(
            leagues.map((league) => this.mapToResDto(league)),
            metaDto,
        );
    }

    async findOne(id: Uuid): Promise<LeagueResDto> {
        let league;
        if (this.isUuid(id)) {
            league = await LeagueEntity.findOne({ where: { id } });
        } else {
            // Try to find by slug/name (simple fallback for elite-league)
            const name = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            league = await LeagueEntity.findOne({ where: { name } });
        }

        if (!league) {
            throw new NotFoundException(`League with ID or name "${id}" not found`);
        }

        return this.mapToResDto(league);
    }

    private isUuid(str: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }

    async create(reqDto: CreateLeagueReqDto): Promise<LeagueResDto> {
        const league = new LeagueEntity({
            name: reqDto.name,
            status: reqDto.status || 'active',
            tier: reqDto.tier || 1,
            division: reqDto.division || 1,
        });

        await league.save();

        return this.mapToResDto(league);
    }

    async update(id: Uuid, reqDto: UpdateLeagueReqDto): Promise<LeagueResDto> {
        assert(id, 'id is required');
        const league = await LeagueEntity.findOneByOrFail({ id });

        if (reqDto.name) league.name = reqDto.name;
        if (reqDto.status) league.status = reqDto.status;
        if (reqDto.tier) league.tier = reqDto.tier;
        if (reqDto.division) league.division = reqDto.division;

        await league.save();

        return this.mapToResDto(league);
    }

    async delete(id: Uuid): Promise<void> {
        assert(id, 'id is required');
        const league = await LeagueEntity.findOneByOrFail({ id });
        await league.softRemove();
    }

    async getStandings(id: Uuid, season: number): Promise<LeagueStandingResDto[]> {
        let leagueId = id;
        if (!this.isUuid(id)) {
            const name = id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            const league = await LeagueEntity.findOne({ where: { name } });
            if (!league) {
                throw new NotFoundException(`League "${id}" not found`);
            }
            leagueId = league.id;
        }

        const standings = await LeagueStandingEntity.find({
            where: { leagueId, season },
            relations: ['team'],
            order: {
                points: 'DESC',
                // goalDifference is not a column, so we rely on goalsFor/Against or handle sort in memory
                goalsFor: 'DESC',
            },
        });

        // Calculate goal difference and sort fully in memory to be correct
        const result = standings.map(s => {
            const gd = s.goalsFor - s.goalsAgainst;
            return {
                ...s,
                goalDifference: gd,
                teamName: s.team?.name || 'Unknown',
            };
        });

        // Sort by Points -> GD -> GF
        result.sort((a, b) => {
            if (a.points !== b.points) return b.points - a.points;
            if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
            return b.goalsFor - a.goalsFor;
        });

        return plainToInstance(LeagueStandingResDto, result, { excludeExtraneousValues: true });
    }

    private mapToResDto(league: LeagueEntity): LeagueResDto {
        return plainToInstance(LeagueResDto, {
            id: league.id,
            name: league.name,
            tier: league.tier,
            division: league.division,
            status: league.status,
            createdAt: league.createdAt,
            updatedAt: league.updatedAt,
        });
    }
}
