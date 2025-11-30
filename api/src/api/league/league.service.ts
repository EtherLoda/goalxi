import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { paginate } from '@/utils/offset-pagination';
import { Injectable } from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { CreateLeagueReqDto } from './dto/create-league.req.dto';
import { LeagueResDto } from './dto/league.res.dto';
import { ListLeagueReqDto } from './dto/list-league.req.dto';
import { UpdateLeagueReqDto } from './dto/update-league.req.dto';
import { LeagueEntity } from '@goalxi/database';

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
        assert(id, 'id is required');
        const league = await LeagueEntity.findOneByOrFail({ id });

        return this.mapToResDto(league);
    }

    async create(reqDto: CreateLeagueReqDto): Promise<LeagueResDto> {
        const league = new LeagueEntity({
            name: reqDto.name,
            season: reqDto.season,
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
        if (reqDto.season) league.season = reqDto.season;
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

    private mapToResDto(league: LeagueEntity): LeagueResDto {
        return plainToInstance(LeagueResDto, {
            id: league.id,
            name: league.name,
            season: league.season,
            tier: league.tier,
            division: league.division,
            status: league.status,
            createdAt: league.createdAt,
            updatedAt: league.updatedAt,
        });
    }
}
