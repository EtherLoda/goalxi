import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  Uuid,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

export interface LeagueHierarchyInfo {
  league: LeagueEntity;
  teamCount: number;
  botCount: number;
  playerTeamCount: number;
}

export interface PromotionRelegationSlots {
  directPromotion: number; // 1-4名升级
  playoff: number; // 9-12名升降级附加赛
  directRelegation: number; // 13-16名降级
}

@Injectable()
export class LeagueStructureService {
  constructor(
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
  ) {}

  /**
   * 获取指定级别的所有联赛
   */
  async getLeaguesByTier(tier: number): Promise<LeagueEntity[]> {
    return this.leagueRepository.find({
      where: { tier },
      order: { tierDivision: 'ASC' },
    });
  }

  /**
   * 获取联赛详情
   */
  async getLeagueById(leagueId: string): Promise<LeagueEntity | null> {
    return this.leagueRepository.findOne({ where: { id: leagueId as Uuid } });
  }

  /**
   * 获取联赛层级信息（球队数、BOT数、玩家数）
   */
  async getLeagueHierarchyInfo(
    leagueId: string,
  ): Promise<LeagueHierarchyInfo | null> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as Uuid },
    });
    if (!league) return null;

    const standings = await this.standingRepository.find({
      where: { leagueId: leagueId as Uuid },
    });
    const teamCount = standings.length;

    // 查询 BOT 球队数量
    const teamIds = standings.map((s) => s.teamId);
    const botCount = await this.teamRepository.count({
      where: {
        id: teamIds.length > 0 ? (teamIds as any) : undefined,
        isBot: true,
      },
    });

    const playerTeamCount = teamCount - botCount;

    return {
      league,
      teamCount,
      botCount,
      playerTeamCount,
    };
  }

  /**
   * 获取联赛的升降级名额
   */
  getPromotionRelegationSlots(league: LeagueEntity): PromotionRelegationSlots {
    return {
      directPromotion: league.promotionSlots,
      playoff: league.playoffSlots,
      directRelegation: league.relegationSlots,
    };
  }

  /**
   * 获取对应的下级联赛列表
   * 使用 parentLeagueId 关系
   */
  async getCorrespondingLowerLeagues(
    leagueId: string,
  ): Promise<LeagueEntity[]> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as Uuid },
    });
    if (!league) return [];

    // 只有L1和L2有下级联赛
    if (league.tier < 1 || league.tier > 2) return [];

    // 使用 parentLeagueId 查找下级联赛
    return this.leagueRepository.find({
      where: { parentLeagueId: leagueId as Uuid },
      order: { tierDivision: 'ASC' },
    });
  }

  /**
   * 获取上级联赛
   */
  async getParentLeague(leagueId: string): Promise<LeagueEntity | null> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as Uuid },
    });
    if (!league || !league.parentLeagueId) return null;

    return this.leagueRepository.findOne({
      where: { id: league.parentLeagueId },
    });
  }

  /**
   * 获取联赛当前赛季的排名
   *
   * Sorted with the canonical `STANDINGS_SORT_SQL` key. This used to be
   * `order: { points: 'DESC', goalDifference: 'DESC', goalsFor: 'DESC' }`
   * — sorted by the STORED `goal_difference` column while the other three
   * readers sorted by the computed expression, and with no deterministic
   * tie-break, so a total tie fell back to heap order. It also returned
   * the raw stored `position`, which is written by
   * `MatchCompletionService.recalculateLeaguePositions` on a different
   * schedule — so two readers of the same league could disagree on row
   * order.
   */
  async getLeagueStandings(
    leagueId: string,
    season: number,
  ): Promise<LeagueStandingEntity[]> {
    return (
      this.standingRepository
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.team', 'team')
        .where('s.leagueId = :leagueId', { leagueId: leagueId as Uuid })
        .andWhere('s.season = :season', { season })
        .orderBy('s.points', 'DESC')
        .addOrderBy('s.goalsFor - s.goalsAgainst', 'DESC')
        .addOrderBy('s.goalsFor', 'DESC')
        // Deterministic tie-breaks — see STANDINGS_SORT_SQL.
        .addOrderBy('s.wins', 'DESC')
        .addOrderBy('s.goalsAgainst', 'ASC')
        .addOrderBy('s.teamId', 'ASC')
        .getMany()
    );
  }

  /**
   * 计算排名并更新 position 字段
   *
   * Sorts with the canonical `STANDINGS_SORT_SQL` key, mirroring
   * `LeagueService.getStandings` and
   * `MatchCompletionService.recalculateLeaguePositions`.
   *
   * Only rows whose position actually changed are written, and the write
   * is a column-scoped `UPDATE`. `save(standings)` emitted one UPDATE per
   * row writing every column, which could clobber a `goals_for` that a
   * concurrently-completing match had just incremented.
   */
  async updateStandingsPositions(
    leagueId: string,
    season: number,
  ): Promise<void> {
    const standings = await this.standingRepository
      .createQueryBuilder('s')
      .where('s.leagueId = :leagueId', { leagueId: leagueId as Uuid })
      .andWhere('s.season = :season', { season })
      .orderBy('s.points', 'DESC')
      .addOrderBy('s.goalsFor - s.goalsAgainst', 'DESC')
      .addOrderBy('s.goalsFor', 'DESC')
      .addOrderBy('s.wins', 'DESC')
      .addOrderBy('s.goalsAgainst', 'ASC')
      .addOrderBy('s.teamId', 'ASC')
      .getMany();

    const moved: LeagueStandingEntity[] = [];
    for (let i = 0; i < standings.length; i++) {
      if (standings[i].position !== i + 1) {
        standings[i].position = i + 1;
        moved.push(standings[i]);
      }
    }

    if (moved.length === 0) {
      return;
    }

    const params: Record<string, unknown> = {};
    const cases = moved
      .map((r, i) => {
        params[`id${i}`] = r.id;
        params[`pos${i}`] = r.position;
        return `WHEN id = :id${i} THEN :pos${i}`;
      })
      .join(' ');

    await this.standingRepository
      .createQueryBuilder()
      .update(LeagueStandingEntity)
      .set({ position: () => `CASE ${cases} ELSE "position" END` })
      .where(moved.map((_, i) => `id = :id${i}`).join(' OR '), params)
      .execute();
  }

  /**
   * 检查联赛是否满员
   */
  async isLeagueFull(leagueId: string): Promise<boolean> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as Uuid },
    });
    if (!league) return false;

    const teamCount = await this.standingRepository.count({
      where: { leagueId: leagueId as Uuid },
    });
    return teamCount >= league.maxTeams;
  }

  /**
   * 获取可入驻的空位（maxTeams - 当前球队数）
   */
  async getAvailableSlots(leagueId: string): Promise<number> {
    const league = await this.leagueRepository.findOne({
      where: { id: leagueId as Uuid },
    });
    if (!league) return 0;

    const teamCount = await this.standingRepository.count({
      where: { leagueId: leagueId as Uuid },
    });
    return Math.max(0, league.maxTeams - teamCount);
  }
}
