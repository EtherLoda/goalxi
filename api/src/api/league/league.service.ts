import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { Uuid } from '@/common/types/common.type';
import { paginate } from '@/utils/offset-pagination';
import {
  ArchivedSeasonResultEntity,
  LeagueEntity,
  LeagueStandingEntity,
  SeasonResultEntity,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import assert from 'assert';
import { plainToInstance } from 'class-transformer';
import { DataSource } from 'typeorm';
import { CreateLeagueReqDto } from './dto/create-league.req.dto';
import {
  LeagueContextResDto,
  LeagueNeighbourDto,
} from './dto/league-context.res.dto';
import { LeagueStandingResDto } from './dto/league-standing.res.dto';
import { LeagueTeamStatusResDto } from './dto/league-team-status.res.dto';
import { LeagueResDto } from './dto/league.res.dto';
import { ListLeagueReqDto } from './dto/list-league.req.dto';
import { UpdateLeagueReqDto } from './dto/update-league.req.dto';

/**
 * How many completed matches the FE's recent-form strip shows per team.
 * The DTO contract is 5 (`recentMatches[0]` is "last match").
 */
const RECENT_FORM_MATCHES = 5;

/**
 * How far back the arrival/departure counters reach.
 *
 * Season-scoped was the obvious alternative and it is wrong: an eleven-week
 * season leaves every club with a non-zero count by mid-season, so the column
 * stops distinguishing anyone. A week is roughly one transfer window's worth
 * of activity in this game's pacing.
 */
const TRANSFER_WINDOW_DAYS = 7;

/** One `GROUP BY team_id` counter row. */
interface CountRow {
  teamId: string;
  count: number;
}

/** One arrival/departure aggregate row. */
interface TransferRow {
  teamId: string;
  joined: number;
  left: number;
}

/** One row of the recent-form query (snake_case aliases are mapped in SQL). */
interface RecentFormRow {
  teamId: string;
  matchId: string;
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
  /**
   * `loadRecentForm` needs a raw SQL escape hatch — see the note on that
   * method for why the QueryBuilder cannot express it. That needs a
   * DataSource, which is why this is not a zero-dependency service.
   */
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

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

  /**
   * Where this league sits in the pyramid, plus its four neighbours.
   *
   * Backs the "◀ division 48 / division 50 ▶ · level 4 of 4" strip in the
   * league header. The sideways neighbours are read off one ordered query
   * for the whole tier (at most 64 rows today) rather than with two
   * `tierDivision ± 1` lookups, because divisions are not guaranteed
   * contiguous — a league deleted between two others would make a
   * `division - 1` lookup return nothing and strand the user mid-list.
   */
  async getContext(id: Uuid): Promise<LeagueContextResDto> {
    // `resolveLeagueId` returns a plain string (it may have come from a
    // slug), but every consumer below keys on a uuid column.
    const leagueId = (await this.resolveLeagueId(id)) as Uuid;
    const league = await LeagueEntity.findOne({ where: { id: leagueId } });
    if (!league) {
      throw new NotFoundException(`League "${id}" not found`);
    }

    const [siblings, tierRange] = await Promise.all([
      LeagueEntity.find({
        where: { tier: league.tier },
        order: { tierDivision: 'ASC' },
      }),
      LeagueEntity.createQueryBuilder('league')
        .select('MAX(league.tier)', 'maxTier')
        .getRawOne<{ maxTier: string | null }>(),
    ]);

    const index = siblings.findIndex((row) => row.id === league.id);
    const prev = index > 0 ? siblings[index - 1] : null;
    const next =
      index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;

    // `up` prefers the explicit parent link the pyramid generator writes,
    // falling back to the first league of the tier above so that a
    // hand-created league still gets a usable link instead of a dead end.
    const up =
      league.tier > 1
        ? league.parentLeagueId
          ? await LeagueEntity.findOne({
              where: { id: league.parentLeagueId },
            })
          : await LeagueEntity.findOne({
              where: { tier: league.tier - 1 },
              order: { tierDivision: 'ASC' },
            })
        : null;

    // `down` is one of possibly four children; the first by division is the
    // one a reader expects when stepping down a level.
    const down =
      (await LeagueEntity.findOne({
        where: { parentLeagueId: league.id },
        order: { tierDivision: 'ASC' },
      })) ??
      (await LeagueEntity.findOne({
        where: { tier: league.tier + 1 },
        order: { tierDivision: 'ASC' },
      }));

    return plainToInstance(LeagueContextResDto, {
      league: this.toNeighbour(league),
      tierCount: Number(tierRange?.maxTier ?? league.tier),
      divisionsInTier: siblings.length,
      prev: prev ? this.toNeighbour(prev) : null,
      next: next ? this.toNeighbour(next) : null,
      up: up ? this.toNeighbour(up) : null,
      down: down ? this.toNeighbour(down) : null,
    });
  }

  private toNeighbour(league: LeagueEntity): LeagueNeighbourDto {
    return {
      id: league.id,
      name: league.name,
      tier: league.tier,
      tierDivision: league.tierDivision,
    };
  }

  /**
   * Squad condition for every club in one league.
   *
   * Four counters from four different tables, all of the shape "count rows
   * for a set of team ids". They run as four grouped queries and are merged
   * in Node rather than as one JOIN: a single query would need four LEFT
   * JOINs, which multiply rows (a club with 3 injured and 2 listed yields 6
   * rows) and force COUNT(DISTINCT) corrections on every column. Four small
   * indexed scans are cheaper to read and cheaper to keep correct.
   *
   * Rank order is the standings order, so the board lines up with the table
   * above it and a manager can read "who is 3rd and also has two players
   * suspended" without re-sorting anything.
   */
  async getTeamStatus(
    id: Uuid,
    season?: number,
  ): Promise<LeagueTeamStatusResDto> {
    const leagueId = (await this.resolveLeagueId(id)) as Uuid;
    const seasonToUse = season ?? (await this.currentSeasonOf(leagueId));

    // Same sort key as `getStandings`, including the tie-breaks, so the two
    // tables can never disagree about who is above whom.
    const ranked: { teamId: string; teamName: string }[] =
      await this.dataSource.query(
        `
          SELECT s.team_id AS "teamId", t.name AS "teamName"
          FROM league_standing s
          JOIN team t ON t.id = s.team_id
          WHERE s.league_id = $1 AND s.season = $2
          ORDER BY s.points DESC,
                   (s.goals_for - s.goals_against) DESC,
                   s.goals_for DESC,
                   s.wins DESC,
                   s.goals_against ASC,
                   s.team_id ASC
        `,
        [leagueId, seasonToUse],
      );

    if (ranked.length === 0) {
      return plainToInstance(
        LeagueTeamStatusResDto,
        {
          items: [],
          season: seasonToUse,
          transferWindowDays: TRANSFER_WINDOW_DAYS,
        },
        { excludeExtraneousValues: true },
      );
    }

    const teamIds = ranked.map((row) => row.teamId);

    const [redCards, injured, listed, transfers] = await Promise.all([
      this.dataSource.query(
        `
          SELECT e.team_id AS "teamId", COUNT(*)::int AS "count"
          FROM match_event e
          JOIN match m ON m.id = e.match_id
          WHERE m.league_id = $1
            AND m.season = $2
            AND e.type_name = 'red_card'
            -- A forced exit ("injured, nobody left to bring on") is
            -- stored as a red_card so the pitch state is right, but it
            -- is not a suspension: the player already misses time
            -- through the injury itself.
            AND COALESCE(e.data->>'reason', '') <> 'injury_no_sub'
            AND e.team_id = ANY($3::uuid[])
          GROUP BY e.team_id
        `,
        [leagueId, seasonToUse, teamIds],
      ) as Promise<CountRow[]>,
      this.dataSource.query(
        `
          SELECT p.team_id AS "teamId", COUNT(*)::int AS "count"
          FROM player p
          WHERE p.team_id = ANY($1::uuid[])
            AND p.injury_state IS NOT NULL
            AND p.deleted_at IS NULL
          GROUP BY p.team_id
        `,
        [teamIds],
      ) as Promise<CountRow[]>,
      this.dataSource.query(
        `
          SELECT p.team_id AS "teamId", COUNT(*)::int AS "count"
          FROM player p
          WHERE p.team_id = ANY($1::uuid[])
            AND p.on_transfer = true
            AND p.deleted_at IS NULL
          GROUP BY p.team_id
        `,
        [teamIds],
      ) as Promise<CountRow[]>,
      this.dataSource.query(
        `
          SELECT x.team_id AS "teamId",
                 SUM(x.joined)::int AS "joined",
                 SUM(x.departed)::int AS "left"
          FROM (
            SELECT to_team_id AS team_id, 1 AS joined, 0 AS departed
            FROM transfer_transaction
            WHERE status = 'COMPLETED'
              AND settled_at >= now() - make_interval(days => $2::int)
              AND to_team_id = ANY($1::uuid[])
            UNION ALL
            SELECT from_team_id AS team_id, 0 AS joined, 1 AS departed
            FROM transfer_transaction
            WHERE status = 'COMPLETED'
              AND settled_at >= now() - make_interval(days => $2::int)
              AND from_team_id = ANY($1::uuid[])
          ) x
          GROUP BY x.team_id
        `,
        [teamIds, TRANSFER_WINDOW_DAYS],
      ) as Promise<TransferRow[]>,
    ]);

    const byTeam = <T extends { teamId: string }>(rows: T[]) =>
      new Map(rows.map((row) => [row.teamId, row]));

    const redCardMap = byTeam(redCards);
    const injuredMap = byTeam(injured);
    const listedMap = byTeam(listed);
    const transferMap = byTeam(transfers);

    return plainToInstance(
      LeagueTeamStatusResDto,
      {
        items: ranked.map((row, index) => ({
          teamId: row.teamId,
          teamName: row.teamName,
          position: index + 1,
          redCards: redCardMap.get(row.teamId)?.count ?? 0,
          injured: injuredMap.get(row.teamId)?.count ?? 0,
          listed: listedMap.get(row.teamId)?.count ?? 0,
          joined: transferMap.get(row.teamId)?.joined ?? 0,
          left: transferMap.get(row.teamId)?.left ?? 0,
        })),
        season: seasonToUse,
        transferWindowDays: TRANSFER_WINDOW_DAYS,
      },
      { excludeExtraneousValues: true },
    );
  }

  /**
   * Latest season that has standings rows for this league.
   *
   * The standings endpoint defaults `season` to 1 from a pipe, which is fine
   * for a single-season world and wrong the moment a league ages. This board
   * defaults to "whatever season is actually current" instead, because a
   * condition board that opens on an empty season 1 is worse than useless.
   */
  private async currentSeasonOf(leagueId: string): Promise<number> {
    const rows: { season: number | string | null }[] =
      await this.dataSource.query(
        'SELECT MAX(season) AS season FROM league_standing WHERE league_id = $1',
        [leagueId],
      );
    const season = Number(rows[0]?.season ?? 0);
    return Number.isFinite(season) && season > 0 ? season : 1;
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
          matchId: m.matchId,
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
    // Raw SQL, deliberately, and NOT via QueryBuilder.
    //
    // `.from(<string>, alias)` does not accept a subquery string: TypeORM
    // keeps its own main FROM and treats the string as a *table name*, so
    // it emitted
    //
    //   FROM "match" "MatchEntity", "(SELECT * FROM (...) p" "p"
    //
    // and then applied its property replacement inside that string,
    // rewriting `m.home_team_id` to `m"."home_team_id`. Postgres rejected
    // it with `improper qualified name (too many dotted names)`, which
    // surfaced as a 500 on `GET /leagues/:id/standings` — the whole
    // standings page, not just the form strip.
    //
    // Renaming the inner alias does not help: the outer FROM was still
    // emitted. `QueryBuilder.from()` wants a SelectQueryBuilder, and
    // building this UNION ALL of two window queries as one is far more
    // code than it is worth.
    //
    // `dataSource.query` passes the string through untouched. It is the
    // same connection pool and the same parameter binding ($1/$2/$3), so
    // there is no injection surface — the values are still bound, not
    // interpolated.
    const rows = (await this.dataSource.query(
      `
        SELECT
          p.team_id            AS "teamId",
          p.match_id           AS "matchId",
          p.home_score          AS "homeScore",
          p.away_score          AS "awayScore",
          p.home_team_id        AS "homeTeamId",
          p.away_team_id        AS "awayTeamId",
          p.home_team_name      AS "homeTeamName",
          p.away_team_name      AS "awayTeamName",
          p.completed_at_iso    AS "completedAtIso",
          p.scheduled_at_iso    AS "scheduledAtIso"
        FROM (
          SELECT * FROM (
            SELECT
              m.home_team_id AS team_id,
              m.id AS match_id,
              m.home_team_id, m.away_team_id,
              m.home_score, m.away_score,
              m.completed_at AS completed_at_iso,
              m.scheduled_at AS scheduled_at_iso,
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
            WHERE m.league_id = $1
              AND m.season = $2
              AND m.status = 'completed'
            UNION ALL
            SELECT
              m.away_team_id AS team_id,
              m.id AS match_id,
              m.home_team_id, m.away_team_id,
              m.home_score, m.away_score,
              m.completed_at AS completed_at_iso,
              m.scheduled_at AS scheduled_at_iso,
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
            WHERE m.league_id = $1
              AND m.season = $2
              AND m.status = 'completed'
          ) all_rows WHERE rn <= $3
        ) p
      `,
      [leagueId, season, RECENT_FORM_MATCHES],
    )) as RecentFormRow[];

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
