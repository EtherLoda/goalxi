import { Injectable, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LeagueEntity,
  LeagueStandingEntity,
  TeamEntity,
  SeasonResultEntity,
  FanEntity,
  applyPromotionReward,
  applyRelegationReward,
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
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(LeagueEntity)
    private readonly leagueRepository: Repository<LeagueEntity>,
    @InjectRepository(LeagueStandingEntity)
    private readonly standingRepository: Repository<LeagueStandingEntity>,
    @InjectRepository(TeamEntity)
    private readonly teamRepository: Repository<TeamEntity>,
    @InjectRepository(SeasonResultEntity)
    private readonly seasonResultRepository: Repository<SeasonResultEntity>,
    @InjectRepository(FanEntity)
    private readonly fanRepository: Repository<FanEntity>,
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

    this.logger.info(
      `Processing promotion/relegation for ${tiers.length} tiers`,
    );

    for (const tier of tiers) {
      const tierLeagues = leagues.filter((l) => l.tier === tier);
      this.logger.info(
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

    const maxTeams = league.maxTeams || 16;
    const promotionSlots = league.promotionSlots || 1;
    const relegationSlots = league.relegationSlots || 4;

    // Direct promotion: top positions
    for (let i = 0; i < promotionSlots; i++) {
      const standing = standings[i];
      if (standing) {
        await this.promoteTeam(
          standing.team,
          league,
          season,
          standing.position,
        );
      }
    }

    // Direct relegation: bottom positions
    const relegationStart = maxTeams - relegationSlots + 1;
    for (let pos = relegationStart; pos <= maxTeams; pos++) {
      const standing = standings.find((s) => s.position === pos);
      if (standing) {
        await this.relegateTeam(
          standing.team,
          league,
          season,
          standing.position,
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
        this.logger.info(
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
        this.logger.info(
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
      this.logger.info(`${team.name} is at top tier, cannot promote further`);
      return;
    }

    await this.swapTeamLeague(team.id, null, league.id, upperLeague.id);
    await this.saveSeasonResult(team, league, season, position, true, false);
    this.logger.info(
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
      this.logger.info(
        `${team.name} is at bottom tier, cannot relegate further`,
      );
      return;
    }

    await this.swapTeamLeague(team.id, null, league.id, lowerLeague.id);
    await this.saveSeasonResult(team, league, season, position, false, true);
    this.logger.info(
      `↓ ${team.name} relegated from ${league.name} to ${lowerLeague.name}`,
    );
  }

  /**
   * Swap two teams' `leagueId` (or only one when the other is null).
   *
   * Naming is per the *origin* league tier, not the destination:
   *   - `upperTeamId` is the team **leaving** the upper league →
   *     its new leagueId is `lowerLeagueId` → this is a **relegation**
   *   - `lowerTeamId` is the team **leaving** the lower league →
   *     its new leagueId is `upperLeagueId` → this is a **promotion**
   * Either side may be `null` for a one-direction move
   * (direct promote / direct relegate in `processLeagueTier`).
   *
   * Also applies the tier-step fan reward (fans ±10%, emotion ±20,
   * recentForm cleared) via `applyPromotionReward` /
   * `applyRelegationReward` for each side that actually moves. The
   * reward lives here (not in the per-side helpers) so that every
   * `leagueId` mutation funnels through this method, including the
   * playoff-swap path in `SeasonTransitionService`.
   */
  async swapTeamLeague(
    upperTeamId: string,
    lowerTeamId: string | null,
    upperLeagueId: string,
    lowerLeagueId: string,
  ): Promise<void> {
    // `upperTeamId` is the relegated team (moves to lower league).
    const upperTeam = await this.teamRepository.findOne({
      where: { id: upperTeamId as any },
    });
    if (upperTeam) {
      upperTeam.leagueId = lowerLeagueId;
      await this.teamRepository.save(upperTeam);
      await this.applyFanRewardForTierChange(upperTeamId, 'relegate');
    }

    // `lowerTeamId` (if present) is the promoted team (moves to upper league).
    if (lowerTeamId) {
      const lowerTeam = await this.teamRepository.findOne({
        where: { id: lowerTeamId as any },
      });
      if (lowerTeam) {
        lowerTeam.leagueId = upperLeagueId;
        await this.teamRepository.save(lowerTeam);
        await this.applyFanRewardForTierChange(lowerTeamId, 'promote');
      }
    }
  }

  /**
   * Apply the tier-change fan reward to a single team. No-op if the
   * team has no `FanEntity` row yet (a fresh team that has never
   * played — the next `updateAfterMatch` call will lazily create
   * one, and the weekly tick covers it from there).
   *
   * Errors here are logged but never thrown: a fan-reward failure
   * should not abort the league-swap, which is the more important
   * structural change. The next weekly fan tick will reconcile any
   * drift between the actual tier and the fan state.
   */
  private async applyFanRewardForTierChange(
    teamId: string,
    direction: 'promote' | 'relegate',
  ): Promise<void> {
    const fan = await this.fanRepository.findOne({ where: { teamId } });
    if (!fan) {
      this.logger.debug(
        `[PromotionRelegation] no FanEntity for team ${teamId}, skipping ${direction} reward`,
      );
      return;
    }
    try {
      if (direction === 'promote') {
        applyPromotionReward(fan);
      } else {
        applyRelegationReward(fan);
      }
      await this.fanRepository.save(fan);
      this.logger.info(
        `[PromotionRelegation] ${direction} reward applied to team ${teamId}: ` +
          `totalFans=${fan.totalFans}, fanEmotion=${fan.fanEmotion}`,
      );
    } catch (error) {
      this.logger.warn(
        `[PromotionRelegation] failed to apply ${direction} reward for team ${teamId}: ${(error as Error).message}`,
      );
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
