import {
  MatchEntity,
  MatchStatus,
  MatchTeamStatsEntity,
  PlayerCompetitionStatsEntity,
  PlayerEntity,
  TeamEntity,
} from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  CompetitionStatsEntryDto,
  LeaderboardResDto,
} from './dto/leaderboard.res.dto';
import { MatchStatsResDto } from './dto/match-stats.res.dto';
import { TeamStatsResDto } from './dto/team-stats.res.dto';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(MatchEntity)
    private readonly matchRepository: Repository<MatchEntity>,
    @InjectRepository(MatchTeamStatsEntity)
    private readonly matchStatsRepository: Repository<MatchTeamStatsEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
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

    // Allow stats for both in-progress and completed matches
    if (
      match.status !== MatchStatus.COMPLETED &&
      match.status !== MatchStatus.IN_PROGRESS
    ) {
      throw new NotFoundException(
        `Stats not available for match with status: ${match.status}`,
      );
    }

    const stats = await this.matchStatsRepository.find({
      where: { matchId: matchId as any },
    });

    const homeStats = stats.find((s) => s.teamId === match.homeTeamId);
    const awayStats = stats.find((s) => s.teamId === match.awayTeamId);

    if (!homeStats || !awayStats) {
      throw new NotFoundException(`Stats not found for match ${matchId}`);
    }

    return {
      matchId,
      homeTeamStats: homeStats,
      awayTeamStats: awayStats,
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
}
