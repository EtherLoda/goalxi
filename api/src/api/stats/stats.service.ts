import {
  LeagueEntity,
  MatchEntity,
  MatchEventEntity,
  MatchStatus,
  MatchTeamStatsEntity,
  PlayerCompetitionStatsEntity,
  PlayerEntity,
  TeamEntity,
  Uuid,
  type CompetitionType,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CompetitionStatsEntryDto,
  LeaderboardResDto,
} from './dto/leaderboard.res.dto';
import { ComputedTeamStats, MatchStatsResDto } from './dto/match-stats.res.dto';
import {
  PlayerCareerStatsDto,
  PlayerSeasonStatsEntryDto,
  PlayerSeasonStatsResDto,
} from './dto/player-season-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchEventEntity)
    private readonly eventRepository: Repository<MatchEventEntity>,
    @InjectRepository(MatchTeamStatsEntity)
    private readonly matchStatsRepository: Repository<MatchTeamStatsEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(PlayerCompetitionStatsEntity)
    private readonly competitionStatsRepo: Repository<PlayerCompetitionStatsEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
  ) {}

  async getMatchStats(matchId: string): Promise<MatchStatsResDto> {
    const match = await this.matchRepository.findOne({
      where: { id: matchId },
    });

    if (!match) {
      throw new NotFoundException(`Match with ID ${matchId} not found`);
    }

    // For matches that haven't started yet (SCHEDULED / PENDING / etc.) there
    // are no recorded events or per-team stats. Return a zeroed DTO so the
    // match page can still render basic info (teams, schedule, score) instead
    // of failing with a 404. We only treat "match not found" as a real error.
    if (
      match.status !== MatchStatus.COMPLETED &&
      match.status !== MatchStatus.IN_PROGRESS
    ) {
      return this.buildEmptyMatchStats(matchId);
    }

    const [stats, events] = await Promise.all([
      this.matchStatsRepository.find({ where: { matchId: matchId as any } }),
      this.eventRepository.find({ where: { matchId: matchId as any } }),
    ]);

    const homeStats = stats.find((s) => s.teamId === match.homeTeamId);
    const awayStats = stats.find((s) => s.teamId === match.awayTeamId);

    // If no stats records exist (old matches), create empty stats objects
    // Stats will still be computed from events
    const homeStatsData = homeStats || new MatchTeamStatsEntity();
    const awayStatsData = awayStats || new MatchTeamStatsEntity();

    const computeStats = (
      teamId: string,
      rawStats: MatchTeamStatsEntity,
    ): ComputedTeamStats => {
      const teamEvents = events.filter((e) => e.teamId === teamId);
      const typeNameUpper = (t: string) => t.toUpperCase();

      const isShotEvent = (e: MatchEventEntity) =>
        ['GOAL', 'SHOT_ON_TARGET', 'SHOT_OFF_TARGET', 'MISS'].includes(
          typeNameUpper(e.typeName || ''),
        );

      const xG = teamEvents.filter(isShotEvent).reduce((sum, e) => {
        const data = e.data as any;
        return sum + (data?.quality ?? data?.sequence?.shotQuality ?? 0);
      }, 0);

      const goals = teamEvents.filter(
        (e) => typeNameUpper(e.typeName || '') === 'GOAL',
      ).length;

      const saves = teamEvents.filter(
        (e) => typeNameUpper(e.typeName || '') === 'SAVE',
      ).length;

      const tackles = teamEvents.filter(
        (e) => typeNameUpper(e.typeName || '') === 'TACKLE',
      ).length;

      const interceptions = teamEvents.filter(
        (e) => typeNameUpper(e.typeName || '') === 'INTERCEPTION',
      ).length;

      const clearances = teamEvents.filter(
        (e) => typeNameUpper(e.typeName || '') === 'CLEARANCE',
      ).length;

      const passAccuracy =
        rawStats.passesAttempted > 0
          ? Math.round(
              (rawStats.passesCompleted / rawStats.passesAttempted) * 100,
            )
          : 0;

      return {
        xG: Math.round(xG * 100) / 100,
        goals,
        saves,
        tackles,
        interceptions,
        clearances,
        passAccuracy,
      };
    };

    return {
      matchId,
      homeTeamStats: homeStatsData,
      awayTeamStats: awayStatsData,
      homeComputed: computeStats(match.homeTeamId, homeStatsData),
      awayComputed: computeStats(match.awayTeamId, awayStatsData),
    };
  }

  /**
   * Builds a zeroed MatchStatsResDto for matches that haven't started yet.
   * Lets the match page render basic info (teams, score 0–0) without a 404.
   */
  private buildEmptyMatchStats(matchId: string): MatchStatsResDto {
    return {
      matchId,
      homeTeamStats: new MatchTeamStatsEntity(),
      awayTeamStats: new MatchTeamStatsEntity(),
      homeComputed: new ComputedTeamStats(),
      awayComputed: new ComputedTeamStats(),
    };
  }

  async getTeamSeasonStats(
    teamId: string,
    season: number,
  ): Promise<TeamStatsResDto> {
    const team = await this.teamRepository.findOne({
      where: { id: teamId as any },
    });
    if (!team) {
      throw new NotFoundException(`Team with ID ${teamId} not found`);
    }

    // Get all completed matches for this team in the specified season
    const matches = await this.matchRepository.find({
      where: [
        { homeTeamId: teamId, season, status: MatchStatus.COMPLETED },
        { awayTeamId: teamId, season, status: MatchStatus.COMPLETED },
      ],
    });

    const stats: TeamStatsResDto = {
      teamId,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      cleanSheets: 0,
    };

    for (const match of matches) {
      stats.matchesPlayed++;

      const isHome = match.homeTeamId === teamId;
      const goalsFor = isHome ? match.homeScore : match.awayScore;
      const goalsAgainst = isHome ? match.awayScore : match.homeScore;

      stats.goalsFor += goalsFor;
      stats.goalsAgainst += goalsAgainst;

      if (goalsFor > goalsAgainst) {
        stats.wins++;
        stats.points += 3;
      } else if (goalsFor === goalsAgainst) {
        stats.draws++;
        stats.points += 1;
      } else {
        stats.losses++;
      }

      if (goalsAgainst === 0) {
        stats.cleanSheets++;
      }
    }

    stats.goalDifference = stats.goalsFor - stats.goalsAgainst;

    return stats;
  }

  async getLeaderboard(
    leagueId: string,
    season: number,
    type: 'goals' | 'assists' | 'tackles',
    limit: number = 10,
    offset: number = 0,
  ): Promise<LeaderboardResDto> {
    const orderColumn =
      type === 'goals' ? 'goals' : type === 'assists' ? 'assists' : 'tackles';

    const stats = await this.competitionStatsRepo.find({
      where: { leagueId: leagueId as any, season },
      order: { [orderColumn]: 'DESC', playerId: 'ASC' },
      take: limit,
      skip: offset,
    });

    if (stats.length === 0) {
      return { leagueId, season, type, entries: [] };
    }

    // Get player and team info
    const playerIds = stats.map((s) => s.playerId);
    const players = await this.playerRepo.find({
      where: { id: In(playerIds as any[]) },
    });
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const teamIds = [...new Set(players.map((p) => p.teamId).filter(Boolean))];
    const teams = await this.teamRepository.find({
      where: { id: In(teamIds as any[]) },
    });
    const teamMap = new Map(teams.map((t) => [t.id, t]));

    const entries: CompetitionStatsEntryDto[] = stats.map((s) => {
      const player = playerMap.get(s.playerId);
      const team = player?.teamId
        ? teamMap.get(player.teamId as any)
        : undefined;

      return {
        playerId: s.playerId,
        playerName: player?.name || 'Unknown',
        teamId: player?.teamId || ('' as any),
        teamName: team?.name || 'Unknown',
        goals: s.goals,
        assists: s.assists,
        tackles: s.tackles,
        yellowCards: s.yellowCards,
        redCards: s.redCards,
        appearances: s.appearances,
        starts: s.starts,
      };
    });

    return { leagueId, season, type, entries };
  }

  async getPlayerCompetitionStats(
    playerId: string,
    leagueId: string,
    season: number,
  ): Promise<CompetitionStatsEntryDto | null> {
    const stats = await this.competitionStatsRepo.findOne({
      where: { playerId: playerId as any, leagueId: leagueId as any, season },
    });

    if (!stats) {
      return null;
    }

    const player = await this.playerRepo.findOne({
      where: { id: playerId as any },
    });
    const team = player?.teamId
      ? await this.teamRepository.findOne({
          where: { id: player.teamId as any },
        })
      : undefined;

    return {
      playerId: stats.playerId,
      playerName: player?.name || 'Unknown',
      teamId: player?.teamId || ('' as any),
      teamName: team?.name || 'Unknown',
      goals: stats.goals,
      assists: stats.assists,
      tackles: stats.tackles,
      yellowCards: stats.yellowCards,
      redCards: stats.redCards,
      appearances: stats.appearances,
      starts: stats.starts,
    };
  }

  /**
   * Career + per-season competition stats for a single player.
   *
   * The data source is `PlayerCompetitionStatsEntity`, which the
   * simulator writes inside its atomic transaction and the
   * match-completion service never touches (the per-season, per-
   * competition split is the single source of truth for these
   * numbers). The DTO intentionally surfaces `leagueId = null` rows
   * (cup / youth) so the FE can label them rather than drop them.
   *
   * Returned `seasons` is sorted by season DESC, then by league id
   * ASC for stability within a season. The FE renders this in a
   * table; ordering at the API level keeps the table deterministic
   * across page reloads without the FE having to re-sort.
   */
  async getPlayerSeasonStats(
    playerId: string,
  ): Promise<PlayerSeasonStatsResDto> {
    const numericId = Number(playerId);
    if (!Number.isFinite(numericId)) {
      throw new NotFoundException(`Invalid player id: ${playerId}`);
    }

    const player = await this.playerRepo.findOne({
      where: { id: numericId as any },
    });
    if (!player) {
      throw new NotFoundException(`Player ${playerId} not found`);
    }

    // 1. Pull every (league, season) row for this player.
    const rows = await this.competitionStatsRepo.find({
      where: { playerId: numericId as any },
      order: { season: 'DESC', leagueId: 'ASC' },
    });

    // 2. Resolve league names in one shot (avoid N+1 fanout).
    //
    // The competition-stats table doesn't carry a `team_id`
    // column (each row is keyed by player + (league, season) and
    // a player can change teams mid-career). The FE labels every
    // row with the player's CURRENT team — good enough for the
    // MVP stats card. Adding a per-row `team_id` would require a
    // migration + simulator change; deferred until the per-season
    // team-tracking is productised (likely tied to the transfer
    // history feature, not the stats card).
    const leagueIds = Array.from(
      new Set(
        rows
          .map((r) => r.leagueId)
          .filter((id): id is Uuid => !!id),
      ),
    );
    const [leagues, currentTeam] = await Promise.all([
      leagueIds.length
        ? this.leagueRepository.find({
            where: { id: In(leagueIds) },
            select: ['id', 'name'],
          })
        : Promise.resolve([] as LeagueEntity[]),
      player.teamId
        ? this.teamRepository.findOne({
            where: { id: player.teamId as any },
            select: ['id', 'name'],
          })
        : Promise.resolve(null),
    ]);
    const leagueById = new Map(leagues.map((l) => [l.id, l.name]));
    const teamId = (player.teamId as string | null) ?? '';
    const teamName = currentTeam?.name ?? 'Unknown';

    // 3. Project rows to DTO entries.
    const seasons: PlayerSeasonStatsEntryDto[] = rows.map((r) => ({
      leagueId: r.leagueId ?? null,
      leagueName: r.leagueId ? (leagueById.get(r.leagueId) ?? null) : null,
      // Forward the competitionType the simulator wrote on
      // insert. Defaults to 'LEAGUE' for rows that pre-date
      // the migration; the migration backfilled 'CUP' for
      // any null-leagueId rows that existed at apply time.
      competitionType: (r.competitionType ?? 'LEAGUE') as CompetitionType,
      season: r.season,
      teamId,
      teamName,
      goals: r.goals,
      assists: r.assists,
      tackles: r.tackles,
      yellowCards: r.yellowCards,
      redCards: r.redCards,
      appearances: r.appearances,
      starts: r.starts,
      substituteAppearances: r.substituteAppearances,
    }));

    // 4. Aggregate career totals across every row. Sums are safe to
    //    compute by `reduce` — PlayerCompetitionStatsEntity is the
    //    single write-side (simulator), and each row corresponds to a
    //    distinct (league, season) so there's no double-count.
    const career: PlayerCareerStatsDto = rows.reduce(
      (acc, r) => ({
        goals: acc.goals + r.goals,
        assists: acc.assists + r.assists,
        tackles: acc.tackles + r.tackles,
        yellowCards: acc.yellowCards + r.yellowCards,
        redCards: acc.redCards + r.redCards,
        appearances: acc.appearances + r.appearances,
        starts: acc.starts + r.starts,
        substituteAppearances:
          acc.substituteAppearances + r.substituteAppearances,
        seasonsPlayed: acc.seasonsPlayed,
      }),
      {
        goals: 0,
        assists: 0,
        tackles: 0,
        yellowCards: 0,
        redCards: 0,
        appearances: 0,
        starts: 0,
        substituteAppearances: 0,
        seasonsPlayed: 0,
      },
    );
    // `seasonsPlayed` is the count of distinct (league, season) rows,
    // not the number of seasons — a player who played in two leagues
    // in the same season counts as 2. That matches the granularity
    // of the data on the table.
    career.seasonsPlayed = rows.length;

    return {
      playerId: numericId,
      playerName: player.name,
      seasons,
      career,
    };
  }

}
