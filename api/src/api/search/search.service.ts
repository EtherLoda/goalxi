import { LeagueEntity, PlayerEntity, TeamEntity } from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SearchLeaguesReqDto,
  SearchPlayersReqDto,
  SearchTeamsReqDto,
} from './dto/search.dto';

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(TeamEntity)
    private readonly teamRepo: Repository<TeamEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepo: Repository<LeagueEntity>,
  ) {}

  async searchTeams(reqDto: SearchTeamsReqDto) {
    const limit = reqDto.limit || 10;

    const query = this.teamRepo
      .createQueryBuilder('team')
      .where('LOWER(team.name) LIKE LOWER(:q)', { q: `%${reqDto.q}%` })
      .orderBy('team.name', 'ASC')
      .take(limit);

    if (reqDto.leagueId) {
      query.andWhere('team.leagueId = :leagueId', {
        leagueId: reqDto.leagueId,
      });
    }

    const teams = await query.getMany();
    return teams.map((team) => ({
      id: team.id,
      name: team.name,
      leagueId: team.leagueId,
      logoUrl: team.logoUrl,
    }));
  }

  async searchPlayers(reqDto: SearchPlayersReqDto) {
    const limit = reqDto.limit || 10;

    const query = this.playerRepo
      .createQueryBuilder('player')
      .leftJoinAndSelect('player.team', 'team')
      .where('LOWER(player.name) LIKE LOWER(:q)', { q: `%${reqDto.q}%` })
      .andWhere('player.onTransfer = :onTransfer', { onTransfer: false })
      .orderBy('player.name', 'ASC')
      .take(limit);

    if (reqDto.leagueId) {
      query.andWhere('team.leagueId = :leagueId', {
        leagueId: reqDto.leagueId,
      });
    }

    const players = await query.getMany();
    return players.map((player) => ({
      id: player.id,
      name: player.name,
      teamId: player.teamId,
      teamName: player.team?.name,
      leagueId: player.team?.leagueId,
      isGoalkeeper: player.isGoalkeeper,
    }));
  }

  async searchLeagues(reqDto: SearchLeaguesReqDto) {
    const limit = reqDto.limit || 10;

    const leagues = await this.leagueRepo
      .createQueryBuilder('league')
      .where('LOWER(league.name) LIKE LOWER(:q)', { q: `%${reqDto.q}%` })
      .orderBy('league.tier', 'ASC')
      .addOrderBy('league.tierDivision', 'ASC')
      .take(limit)
      .getMany();

    return leagues.map((league) => ({
      id: league.id,
      name: league.name,
      tier: league.tier,
      tierDivision: league.tierDivision,
    }));
  }
}
