import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
} from '@goalxi/database';

export interface PlayoffMatchResult {
  upperTeam: TeamEntity;
  lowerTeam: TeamEntity;
  upperLeague: LeagueEntity;
  lowerLeague: LeagueEntity;
  upperWon: boolean;
}

export interface RelegationResult {
  promoted: TeamEntity[];
  relegated: TeamEntity[];
  swappedTeams: Array<{
    upper: TeamEntity;
    lower: TeamEntity;
    upperLeague: LeagueEntity;
    lowerLeague: LeagueEntity;
  }>;
}

@Injectable()
export class PromotionRelegationService {
  private readonly logger = new Logger(PromotionRelegationService.name);

  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(SeasonResultEntity)
    private readonly seasonResultRepository: Repository<SeasonResultEntity>,
  ) {}

  /**
   * 处理所有级别的升降级
   * 从最高级开始，逐级向下处理
   */
  async processAllTiers(season: number): Promise<void> {
    // 获取所有 tier，按从高到低排序
    const leagues = await this.leagueRepository.find({
      order: { tier: 'ASC' },
    });

    const tiers = [...new Set(leagues.map((l) => l.tier))].sort(
      (a, b) => a - b,
    );

    this.logger.log(
      `Processing promotion/relegation for ${tiers.length} tiers`,
    );

    for (const tier of tiers) {
      const tierLeagues = leagues.filter((l) => l.tier === tier);
      this.logger.log(
        `Processing Tier ${tier} with ${tierLeagues.length} leagues`,
      );

      for (const league of tierLeagues) {
        await this.processLeaguePromotions(league, season);
      }
    }
  }

  /**
   * 处理单个联赛的升降级（直接升级/降级，不含附加赛）
   */
  async processLeaguePromotions(
    league: LeagueEntity,
    season: number,
  ): Promise<void> {
    const standings = await this.standingRepository.find({
      where: { leagueId: league.id, season },
      relations: ['team'],
      order: { position: 'ASC' },
    });

    if (standings.length === 0) {
      this.logger.warn(
        `No standings found for league ${league.id} season ${season}`,
      );
      return;
    }

    // 直接升级：第1名
    const promotionPosition = 1;
    const promotionStanding = standings.find(
      (s) => s.position === promotionPosition,
    );
    if (promotionStanding) {
      await this.promoteTeam(
        promotionStanding.team,
        league,
        season,
        promotionStanding.position,
      );
    }

    // 直接降级：第13-16名
    const relegationPositions = [13, 14, 15, 16];
    for (const pos of relegationPositions) {
      const relegationStanding = standings.find((s) => s.position === pos);
      if (relegationStanding) {
        await this.relegateTeam(
          relegationStanding.team,
          league,
          season,
          relegationStanding.position,
        );
      }
    }
  }

  /**
   * 处理附加赛结果并执行升降级
   * @param playoffResults 附加赛结果数组
   */
  async processPlayoffResultsAndExecuteSwaps(
    playoffResults: PlayoffMatchResult[],
  ): Promise<void> {
    for (const result of playoffResults) {
      if (result.upperWon) {
        // 上级球队赢，保持原 leagueId 不变
        this.logger.log(
          `${result.upperTeam.name} won playoff, stays in ${result.upperLeague.name}`,
        );
      } else {
        // 下级球队赢，互换 leagueId
        await this.swapTeamLeague(
          result.upperTeam.id,
          result.lowerTeam.id,
          result.upperLeague.id,
          result.lowerLeague.id,
        );
        this.logger.log(
          `${result.lowerTeam.name} won playoff, promoted to ${result.upperLeague.name}; ` +
            `${result.upperTeam.name} relegated to ${result.lowerLeague.name}`,
        );
      }
    }
  }

  /**
   * 升级球队
   */
  private async promoteTeam(
    team: TeamEntity,
    league: LeagueEntity,
    season: number,
    position: number,
  ): Promise<void> {
    const upperLeague = await this.getUpperLeague(league);
    if (!upperLeague) {
      this.logger.log(`${team.name} is at top tier, cannot promote further`);
      return;
    }

    await this.swapTeamLeague(team.id, null, league.id, upperLeague.id);
    await this.saveSeasonResult(team, league, season, position, true, false);
    this.logger.log(
      `↑ ${team.name} promoted from ${league.name} to ${upperLeague.name}`,
    );
  }

  /**
   * 降级球队
   */
  private async relegateTeam(
    team: TeamEntity,
    league: LeagueEntity,
    season: number,
    position: number,
  ): Promise<void> {
    const lowerLeague = await this.getLowerLeague(league);
    if (!lowerLeague) {
      this.logger.log(
        `${team.name} is at bottom tier, cannot relegate further`,
      );
      return;
    }

    await this.swapTeamLeague(team.id, null, league.id, lowerLeague.id);
    await this.saveSeasonResult(team, league, season, position, false, true);
    this.logger.log(
      `↓ ${team.name} relegated from ${league.name} to ${lowerLeague.name}`,
    );
  }

  /**
   * 互换球队 leagueId（或只升级/只降级）
   */
  async swapTeamLeague(
    upperTeamId: string,
    lowerTeamId: string | null,
    upperLeagueId: string,
    lowerLeagueId: string,
  ): Promise<void> {
    // 升级球队
    const upperTeam = await this.teamRepository.findOne({
      where: { id: upperTeamId as any },
    });
    if (upperTeam) {
      upperTeam.leagueId = lowerLeagueId;
      await this.teamRepository.save(upperTeam);
    }

    // 降级球队（如果有）
    if (lowerTeamId) {
      const lowerTeam = await this.teamRepository.findOne({
        where: { id: lowerTeamId as any },
      });
      if (lowerTeam) {
        lowerTeam.leagueId = upperLeagueId;
        await this.teamRepository.save(lowerTeam);
      }
    }
  }

  /**
   * 获取上级联赛
   */
  private async getUpperLeague(
    league: LeagueEntity,
  ): Promise<LeagueEntity | null> {
    if (league.tier <= 1) return null;
    // 找到对应的上级联赛（tier-1，tierDivision 对应）
    return this.leagueRepository.findOne({
      where: { tier: league.tier - 1, tierDivision: league.tierDivision },
    });
  }

  /**
   * 获取下级联赛
   */
  private async getLowerLeague(
    league: LeagueEntity,
  ): Promise<LeagueEntity | null> {
    // 找到对应的下级联赛（tier+1，tierDivision 对应）
    return this.leagueRepository.findOne({
      where: { tier: league.tier + 1, tierDivision: league.tierDivision },
    });
  }

  /**
   * 保存赛季结果
   */
  private async saveSeasonResult(
    team: TeamEntity,
    league: LeagueEntity,
    season: number,
    finalPosition: number,
    promoted: boolean,
    relegated: boolean,
  ): Promise<void> {
    const existing = await this.seasonResultRepository.findOne({
      where: { teamId: team.id, season },
    });

    if (existing) {
      existing.finalPosition = finalPosition;
      existing.promoted = promoted;
      existing.relegated = relegated;
      await this.seasonResultRepository.save(existing);
    } else {
      const result = this.seasonResultRepository.create({
        teamId: team.id,
        leagueId: league.id,
        season,
        finalPosition,
        promoted,
        relegated,
      });
      await this.seasonResultRepository.save(result);
    }
  }
}
