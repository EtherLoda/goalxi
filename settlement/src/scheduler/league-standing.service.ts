import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeagueEntity,
  LeagueStandingEntity,
  SeasonResultEntity,
  TeamEntity,
} from '@goalxi/database';

@Injectable()
export class LeagueStandingService {
  private readonly logger = new Logger(LeagueStandingService.name);

  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(SeasonResultEntity)
    private readonly seasonResultRepository: Repository<SeasonResultEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * 归档赛季最终排名到 SeasonResult
   */
  async archiveSeasonFinalStandings(season: number): Promise<void> {
    const standings = await this.standingRepository.find({
      where: { season },
      relations: ['team', 'league'],
    });

    for (const standing of standings) {
      const existing = await this.seasonResultRepository.findOne({
        where: { teamId: standing.teamId, season },
      });

      if (!existing) {
        const result = this.seasonResultRepository.create({
          teamId: standing.teamId,
          leagueId: standing.leagueId,
          season,
          finalPosition: standing.position,
          promoted:
            standing.position <= (standing.league as any)?.promotionSlots,
          relegated:
            standing.position >=
            (standing.league as any)?.maxTeams -
              (standing.league as any)?.relegationSlots +
              1,
        });
        await this.seasonResultRepository.save(result);
      }
    }

    this.logger.log(
      `Archived season ${season} final standings for ${standings.length} teams`,
    );
  }

  /**
   * 初始化新赛季的排行榜
   * 为所有联赛创建新的赛季排行记录
   * 注意：此时升降级已完成，team.leagueId 已经是新的联赛
   */
  async initNewSeasonStandings(newSeason: number): Promise<void> {
    const leagues = await this.leagueRepository.find();

    for (const league of leagues) {
      // 获取该联赛当前（升降级后）的所有球队
      const teamsInLeague = await this.teamRepository.find({
        where: { leagueId: league.id },
      });

      for (const team of teamsInLeague) {
        const existing = await this.standingRepository.findOne({
          where: {
            leagueId: league.id,
            teamId: team.id,
            season: newSeason,
          },
        });

        if (!existing) {
          const newStanding = this.standingRepository.create({
            leagueId: league.id,
            teamId: team.id,
            season: newSeason,
            position: 0, // 初始排名为0，赛季开始后更新
            played: 0,
            points: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0,
            goalDifference: 0,
            recentForm: '',
          });
          await this.standingRepository.save(newStanding);
        }
      }
    }

    this.logger.log(`Initialized standings for Season ${newSeason}`);
  }

  /**
   * 重置指定联赛的排行榜
   */
  async resetLeagueStandings(leagueId: string, season: number): Promise<void> {
    await this.standingRepository.delete({ leagueId, season });

    this.logger.log(`Reset standings for league ${leagueId} season ${season}`);
  }

  /**
   * 获取指定联赛的最终排名
   */
  async getFinalStandings(
    leagueId: string,
    season: number,
  ): Promise<LeagueStandingEntity[]> {
    return this.standingRepository.find({
      where: { leagueId, season },
      relations: ['team'],
      order: { position: 'ASC' },
    });
  }
}
