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
   * Process the direct (non-playoff) promotion/relegation
   * swaps for a single league. The swap pattern is fixed
   * by the pyramid shape:
   *
   *   - The league's #1 swaps with the upper tier's
   *     `(maxTeams - relegationSlots) + tierDivision`,
   *     i.e. the upper tier's #13-#16 entry that maps to
   *     this league's `tierDivision` (1..4 for L2 → L1's
   *     #13-#16). This is the only "auto" promotion: 1
   *     team up, 1 team down, no playoff.
   *   - The league's #(maxTeams - 3)..#maxTeams (4 teams)
   *     each swap with the *same-position* #1 of one of
   *     the league's child leagues. Index-based pairing:
   *     #13 ↔ child[0].#1, #14 ↔ child[1].#1, etc.
   *     This produces 4 simultaneous direct relegations
   *     paired with 4 simultaneous direct promotions
   *     from the next tier.
   *
   * L1 (top tier) and L4 (bottom tier) are boundary
   * cases: L1 has no upper league so its #1 stays put;
   * L4 has no children so its bottom 4 stay put. Both
   * boundaries preserve the per-tier swap balance: L1
   * still moves 4 teams out (its #13-#16 to L2 children)
   * and accepts 4 teams in (L2's #1s); L4 still moves
   * 4 teams out (its #1s up to L3) and accepts 4 teams
   * in (L3's bottom 4). Net change at every tier = 0.
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
    const relegationSlots = league.relegationSlots || 4;
    const relegationStart = maxTeams - relegationSlots + 1; // 13 by default

    // === 直升: #1 ↔ 上一层 #(relegationStart + tierDivision - 1) ===
    // For L1 (tier=1) the upper-league lookup returns null;
    // L1's #1 has nowhere to go up, so it's a no-op.
    const upperLeague = await this.getUpperLeague(league);
    if (upperLeague) {
      const upperMaxTeams = upperLeague.maxTeams || 16;
      const upperRelegationSlots = upperLeague.relegationSlots || 4;
      const upperRelegationStart = upperMaxTeams - upperRelegationSlots + 1;
      // Map: this league's tierDivision (1..4) → upper's
      // (relegationStart..relegationStart+3). For L2-D1
      // (tierDivision=1) we pair with upper #13; L2-D2
      // → upper #14; L2-D3 → #15; L2-D4 → #16. The
      // `tierDivision - 1` index is bounded to the upper
      // tier's relegation zone — if a future league has
      // more than 4 children per upper the extra ones
      // would slot into the next upper tier instead
      // (and the pyramid shape would have to be reshaped).
      const upperRelegationPos =
        upperRelegationStart +
        ((league.tierDivision - 1) % upperRelegationSlots);

      const ourChampion = standings.find((s) => s.position === 1);
      const upperRelegated = await this.standingRepository.findOne({
        where: {
          leagueId: upperLeague.id,
          season,
          position: upperRelegationPos,
        },
      });

      if (ourChampion && upperRelegated && upperRelegated.team) {
        // 1:1 swap: upper team's `leagueId` becomes this
        // league's id (relegation), our champion's
        // `leagueId` becomes the upper league's id
        // (promotion). The `swapTeamLeague` helper
        // already applies the per-team fan reward
        // (±10% / ±20 emotion / cleared `recentForm`).
        await this.swapTeamLeague(
          upperRelegated.team.id,
          ourChampion.team.id,
          upperLeague.id,
          league.id,
        );
        await this.saveSeasonResult(
          ourChampion.team,
          league,
          season,
          1,
          true,
          false,
        );
        await this.saveSeasonResult(
          upperRelegated.team,
          upperLeague,
          season,
          upperRelegationPos,
          false,
          true,
        );
        this.logger.info(
          `↑ ${ourChampion.team.name} promoted from ${league.name} #1 to ${upperLeague.name} #${upperRelegationPos}; ` +
            `${upperRelegated.team.name} relegated to ${league.name}`,
        );
      } else {
        this.logger.warn(
          `[PromotionRelegation] Missing #1 for ${league.name} or missing #${upperRelegationPos} for ${upperLeague.name} — promotion skipped`,
        );
      }
    } else {
      this.logger.info(`${league.name} is at top tier, no direct promotion`);
    }

    // === 直降: #13..#16 ↔ 下一层 children[0..3].#1 ===
    // For L4 (bottom tier) the child-league lookup
    // returns an empty array; L4's bottom 4 stay put.
    const childLeagues = await this.leagueRepository.find({
      where: { parentLeagueId: league.id },
      order: { tierDivision: 'ASC' },
    });

    if (childLeagues.length > 0) {
      // Pair our bottom-4 with each child league's #1
      // in tierDivision order. If we have more children
      // than relegation slots (shouldn't happen with
      // the current 1:4 pyramid shape but the guard is
      // cheap), the extras are silently dropped.
      for (let i = 0; i < relegationSlots && i < childLeagues.length; i++) {
        const relegationPos = relegationStart + i; // 13, 14, 15, 16
        const childLeague = childLeagues[i];

        const ourRelegated = standings.find(
          (s) => s.position === relegationPos,
        );
        const childChampion = await this.standingRepository.findOne({
          where: { leagueId: childLeague.id, season, position: 1 },
        });

        if (
          ourRelegated &&
          ourRelegated.team &&
          childChampion &&
          childChampion.team
        ) {
          await this.swapTeamLeague(
            ourRelegated.team.id,
            childChampion.team.id,
            league.id,
            childLeague.id,
          );
          await this.saveSeasonResult(
            ourRelegated.team,
            league,
            season,
            relegationPos,
            false,
            true,
          );
          await this.saveSeasonResult(
            childChampion.team,
            childLeague,
            season,
            1,
            true,
            false,
          );
          this.logger.info(
            `↓ ${ourRelegated.team.name} relegated from ${league.name} #${relegationPos} to ${childLeague.name} #1; ` +
              `${childChampion.team.name} promoted to ${league.name}`,
          );
        } else {
          this.logger.warn(
            `[PromotionRelegation] Missing #${relegationPos} for ${league.name} or missing #1 for ${childLeague.name} — relegation slot ${i + 1} skipped`,
          );
        }
      }
    } else {
      this.logger.info(
        `${league.name} is at bottom tier, no direct relegation`,
      );
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
