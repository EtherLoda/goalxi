import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { paginate } from '@/utils/offset-pagination';
import {
  ArchivedSeasonResultEntity,
  LeagueEntity,
  LeagueStandingEntity,
  MatchEntity,
  SeasonResultEntity,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { CreateLeagueReqDto } from './dto/create-league.req.dto';
import { LeagueStandingResDto } from './dto/league-standing.res.dto';
import { LeagueResDto } from './dto/league.res.dto';
import { ListLeagueReqDto } from './dto/list-league.req.dto';
import { UpdateLeagueReqDto } from './dto/update-league.req.dto';

@Injectable()
export class LeagueService {
  constructor() {}

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
      const name = id
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      league = await LeagueEntity.findOne({ where: { name } });
    }

    if (!league) {
      throw new NotFoundException(`League with ID or name "${id}" not found`);
    }

    return this.mapToResDto(league);
  }

  private isUuid(str: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  }

  async create(reqDto: CreateLeagueReqDto): Promise<LeagueResDto> {
    const league = new LeagueEntity({
      name: reqDto.name,
      status: reqDto.status || 'active',
      tier: reqDto.tier || 1,
      tierDivision: reqDto.tierDivision || 1,
      maxTeams: reqDto.maxTeams || 16,
      promotionSlots: reqDto.promotionSlots ?? 1,
      playoffSlots: reqDto.playoffSlots ?? 4,
      relegationSlots: reqDto.relegationSlots ?? 4,
      parentLeagueId: reqDto.parentLeagueId as Uuid,
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
    if (reqDto.tierDivision) league.tierDivision = reqDto.tierDivision;
    if (reqDto.maxTeams) league.maxTeams = reqDto.maxTeams;
    if (reqDto.promotionSlots !== undefined)
      league.promotionSlots = reqDto.promotionSlots;
    if (reqDto.playoffSlots !== undefined)
      league.playoffSlots = reqDto.playoffSlots;
    if (reqDto.relegationSlots !== undefined)
      league.relegationSlots = reqDto.relegationSlots;
    if (reqDto.parentLeagueId !== undefined)
      league.parentLeagueId = reqDto.parentLeagueId as Uuid;

    await league.save();

    return this.mapToResDto(league);
  }

  async delete(id: Uuid): Promise<void> {
    assert(id, 'id is required');
    const league = await LeagueEntity.findOneByOrFail({ id });
    await league.softRemove();
  }

  async getStandings(
    id: Uuid,
    season: number,
  ): Promise<LeagueStandingResDto[]> {
    const leagueId = await this.resolveLeagueId(id);

    // Sort in the DB so the FE receives rows already in rank order, using
    // the SAME key as `MatchCompletionService.recalculateLeaguePositions`
    // and `league-structure.service.ts`. The three implementations used to
    // drift apart — one sorted by the stored `goal_difference` column, the
    // other two by the computed expression — and they all stopped at three
    // keys, so a team tied on (points, GD, GF) got an arbitrary rank from
    // Postgres heap order. `STANDINGS_SORT_SQL` documents the 4th/5th/6th
    // tie-breaks.
    //
    // `goalDifference` IS maintained now (`updateLeagueStandings` writes
    // it), but the computed expression stays the canonical key so the
    // sort can't be wrong even if a row predates that fix.
    //
    // TypeORM 0.3's addOrderBy doesn't quote expressions containing
    // arithmetic, so the generated SQL is the raw `s.goalsFor -
    // s.goalsAgainst` PG expects.
    const standings = await LeagueStandingEntity.createQueryBuilder('s')
      .leftJoinAndSelect('s.team', 'team')
      .where('s.leagueId = :leagueId', { leagueId })
      .andWhere('s.season = :season', { season })
      .orderBy('s.points', 'DESC')
      .addOrderBy('s.goalsFor - s.goalsAgainst', 'DESC')
      .addOrderBy('s.goalsFor', 'DESC')
      .addOrderBy('s.wins', 'DESC')
      .addOrderBy('s.goalsAgainst', 'ASC')
      .addOrderBy('s.teamId', 'ASC')
      .getMany();

    // Get completed matches to calculate recentForm dynamically
    const completedMatches = await MatchEntity.find({
      where: { leagueId, season, status: 'completed' as any },
      relations: ['homeTeam', 'awayTeam'],
      order: { completedAt: 'DESC' },
    });

    // Build recentMatches with details for each team
    const teamRecentMatches: Record<string, any[]> = {};
    for (const standing of standings) {
      const teamMatches = completedMatches
        .filter(
          (m) =>
            m.homeTeamId === standing.teamId ||
            m.awayTeamId === standing.teamId,
        )
        .slice(0, 5);

      const matches = [];
      for (const m of teamMatches) {
        const isHome = m.homeTeamId === standing.teamId;
        const myScore = isHome ? m.homeScore : m.awayScore;
        const oppScore = isHome ? m.awayScore : m.homeScore;
        const opponentName = isHome
          ? (m.awayTeam as any)?.name || 'Unknown'
          : (m.homeTeam as any)?.name || 'Unknown';

        let result: 'W' | 'D' | 'L';
        if (myScore > oppScore) result = 'W';
        else if (myScore < oppScore) result = 'L';
        else result = 'D';

        matches.push({
          result,
          homeScore: m.homeScore,
          awayScore: m.awayScore,
          opponentName,
          isHome,
          scheduledAt:
            m.completedAt?.toISOString() || m.scheduledAt?.toISOString() || '',
        });
      }
      teamRecentMatches[standing.teamId] = matches;
    }

    // The SQL already returns standings in rank order, so the only
    // work left is to compute GD for the DTO (the column exists on
    // the entity but isn't maintained by the update path) and to
    // renumber positions 1..N from the result index. No in-memory
    // sort needed — the DB did it.
    const result = standings.map((s) => {
      const recentMatches = teamRecentMatches[s.teamId] || [];
      return {
        ...s,
        goalDifference: s.goalsFor - s.goalsAgainst,
        teamName: s.team?.name || 'Unknown',
        recentMatches,
      };
    });

    // Re-number positions to match the (now DB-sorted) rank order.
    result.forEach((item, index) => {
      item.position = index + 1;
    });

    return plainToInstance(LeagueStandingResDto, result, {
      excludeExtraneousValues: true,
    });
  }

  private mapToResDto(league: LeagueEntity): LeagueResDto {
    return plainToInstance(LeagueResDto, {
      id: league.id,
      name: league.name,
      tier: league.tier,
      tierDivision: league.tierDivision,
      maxTeams: league.maxTeams,
      promotionSlots: league.promotionSlots,
      playoffSlots: league.playoffSlots,
      relegationSlots: league.relegationSlots,
      status: league.status,
      createdAt: league.createdAt,
      updatedAt: league.updatedAt,
    });
  }

  /**
   * List all seasons (past + current) for which a league has at
   * least one standing. Used by the league history page to
   * populate the season filter.
   *
   * Implementation: union distinct `season` values from
   * `season_result` (current season, populated while the season
   * is in progress) and `archived_season_result` (everything
   * past, written by the season-archive cron at season end).
   * Deduplicate via Set; sort descending so the most recent
   * season lands at index 0 — that's what the FE's
   * "select latest by default" UX expects.
   */
  async getPastSeasons(id: Uuid): Promise<{ season: number }[]> {
    const leagueId = await this.resolveLeagueId(id);

    const [current, archived] = await Promise.all([
      SeasonResultEntity.find({
        where: { leagueId },
        select: ['season'],
      }),
      ArchivedSeasonResultEntity.find({
        where: { leagueId },
        select: ['season'],
      }),
    ]);

    const set = new Set<number>();
    for (const row of [...current, ...archived]) {
      set.add(row.season);
    }
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((season) => ({ season }));
  }

  /**
   * Resolve a league identifier that may be either a UUID or a
   * slug-style name (e.g. `premier-league`). Returns the
   * canonical UUID used by every other league query.
   */
  private async resolveLeagueId(id: Uuid): Promise<string> {
    if (this.isUuid(id)) {
      return id;
    }
    const name = id
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const league = await LeagueEntity.findOne({ where: { name } });
    if (!league) {
      throw new NotFoundException(`League "${id}" not found`);
    }
    return league.id;
  }
}
