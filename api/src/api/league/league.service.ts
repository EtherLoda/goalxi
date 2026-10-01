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

/**
 * How many completed matches the FE's recent-form strip shows per team.
 * The DTO contract is 5 (`recentMatches[0]` is "last match").
 */
const RECENT_FORM_MATCHES = 5;

/** One row of the recent-form query (snake_case aliases are mapped in SQL). */
interface RecentFormRow {
  teamId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  homeTeamName: string | null;
  awayTeamName: string | null;
  completedAtIso: string | null;
  scheduledAtIso: string | null;
}

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

    // Recent form: the last 5 completed matches per team.
    //
    // This used to load EVERY completed match in the season with both
    // team relations joined (240 matches + 480 team rows), then filter
    // that array in Node once per standing — O(teams x matches), i.e.
    // 3,840 comparisons per request, on a `@Public()` endpoint. None of
    // the `match` indexes covered the predicate, so it was also a seq
    // scan plus a sort on every page view.
    //
    // One window-function query instead: expand each match into a row per
    // participant, rank each team's rows by `completed_at DESC`, keep the
    // top 5. At most 5 x 16 = 80 rows come back regardless of season
    // length, and the new `(league_id, season, status, completed_at)`
    // index (migration 1788000000020) serves it.
    const recentMatchesByTeam = await this.loadRecentForm(leagueId, season);

    // Build recentMatches with details for each team
    const teamRecentMatches: Record<string, any[]> = {};
    for (const standing of standings) {
      const teamMatches = recentMatchesByTeam.get(standing.teamId) ?? [];

      const matches = [];
      for (const m of teamMatches) {
        const isHome = m.homeTeamId === standing.teamId;
        const myScore = isHome ? m.homeScore : m.awayScore;
        const oppScore = isHome ? m.awayScore : m.homeScore;
        const opponentName = isHome
          ? (m.awayTeamName ?? 'Unknown')
          : (m.homeTeamName ?? 'Unknown');

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
          scheduledAt: m.completedAtIso || m.scheduledAtIso || '',
        });
      }
      teamRecentMatches[standing.teamId] = matches;
    }

    // The SQL already returns standings in rank order, so the only
    // work left is to compute GD for the DTO and renumber positions 1..N
    // from the result index. No in-memory sort needed — the DB did it.
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

  /**
   * The last `RECENT_FORM_MATCHES` completed matches for every team in a
   * league+season, as a Map keyed by teamId and already ordered most
   * recent first.
   *
   * ## Why raw SQL
   *
   * The shape needed is "top N per group", which needs a window
   * function. TypeORM's query builder has no portable API for that, and
   * the previous implementation approximated it in Node — loading the
   * whole season and filtering it once per team.
   *
   * The query:
   *   1. `per_team` — a `UNION ALL` that expands each match into one row
   *      per participant, carrying the OPPONENT's name along. Both halves
   *      hit `(league_id, season, status, completed_at)`.
   *   2. `ranked` — `ROW_NUMBER() OVER (PARTITION BY team_id ORDER BY
   *      completed_at DESC, id DESC)`; `id DESC` is a deterministic
   *      tie-break so two matches completed in the same millisecond don't
   *      swap places between requests.
   *   3. outer — keep `rn <= 5`.
   *
   * `completed_at DESC NULLS LAST` keeps matches that were completed
   * without a timestamp (older rows / admin replays) out of the "recent"
   * strip rather than letting NULLs sort to the top.
   */
  private async loadRecentForm(
    leagueId: string,
    season: number,
  ): Promise<Map<string, RecentFormRow[]>> {
    const rows = await MatchEntity.createQueryBuilder()
      .select('p.team_id', 'teamId')
      .addSelect('p.home_score', 'homeScore')
      .addSelect('p.away_score', 'awayScore')
      .addSelect('p.home_team_id', 'homeTeamId')
      .addSelect('p.away_team_id', 'awayTeamId')
      .addSelect('p.home_team_name', 'homeTeamName')
      .addSelect('p.away_team_name', 'awayTeamName')
      .addSelect('p.completed_at_iso', 'completedAtIso')
      .addSelect('p.scheduled_at_iso', 'scheduledAtIso')
      .from(
        `(
          SELECT * FROM (
            SELECT
              m.home_team_id AS team_id,
              m.home_team_id, m.away_team_id,
              m.home_score, m.away_score,
              m.scheduled_at, m.completed_at,
              m.season,
              ht.name AS home_team_name,
              at.name AS away_team_name,
              ROW_NUMBER() OVER (
                PARTITION BY m.home_team_id
                ORDER BY m.completed_at DESC NULLS LAST, m.id DESC
              ) AS rn
            FROM "match" m
            LEFT JOIN "team" ht ON ht.id = m.home_team_id
            LEFT JOIN "team" at ON at.id = m.away_team_id
            WHERE m.league_id = :leagueId
              AND m.season = :season
              AND m.status = 'completed'
            UNION ALL
            SELECT
              m.away_team_id AS team_id,
              m.home_team_id, m.away_team_id,
              m.home_score, m.away_score,
              m.scheduled_at, m.completed_at,
              m.season,
              ht.name AS home_team_name,
              at.name AS away_team_name,
              ROW_NUMBER() OVER (
                PARTITION BY m.away_team_id
                ORDER BY m.completed_at DESC NULLS LAST, m.id DESC
              ) AS rn
            FROM "match" m
            LEFT JOIN "team" ht ON ht.id = m.home_team_id
            LEFT JOIN "team" at ON at.id = m.away_team_id
            WHERE m.league_id = :leagueId
              AND m.season = :season
              AND m.status = 'completed'
          ) all_rows WHERE rn <= :limit
        ) p`,
        'p',
      )
      .setParameter('leagueId', leagueId)
      .setParameter('season', season)
      .setParameter('limit', RECENT_FORM_MATCHES)
      .getRawMany<RecentFormRow>();

    const byTeam = new Map<string, RecentFormRow[]>();
    for (const row of rows) {
      const list = byTeam.get(row.teamId) ?? [];
      list.push(row);
      byTeam.set(row.teamId, list);
    }
    // The outer SELECT has no ORDER BY of its own, so restore the
    // per-team most-recent-first ordering the DTO's `recentMatches[0]`
    // relies on.
    for (const list of byTeam.values()) {
      list.sort((a, b) => (a.completedAtIso < b.completedAtIso ? 1 : -1));
    }
    return byTeam;
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
