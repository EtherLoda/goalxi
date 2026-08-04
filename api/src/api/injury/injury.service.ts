import {
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
  estimateRecoveryDays,
} from '@goalxi/database';
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, MoreThanOrEqual, Repository } from 'typeorm';

export interface InjuryHistoryResDto {
  id: string;
  injuryType: string;
  severity: number;
  /** Single deterministic estimate (legacy min/max columns merged). */
  estimatedDays: number;
  occurredAt: Date;
  recoveredAt?: Date;
  /**
   * Derived from `recoveredAt` — kept in the DTO for API stability so
   * existing frontend code keeps working without a DTO migration.
   */
  isRecovered: boolean;
  matchId?: string | null;
  opponentName?: string | null;
}

export interface PlayerInjuryStatusResDto {
  playerId: number;
  playerName: string;
  isInjured: boolean;
  currentInjuryValue: number;
  injuryType?: string;
  injuryState?: 'minor' | 'severe' | null;
  injuredAt?: Date;
  /** Single deterministic estimate in days. */
  estimatedRecoveryDays?: number;
}

export interface TeamInjuryHistoryQuery {
  /** Max rows to return. Default 20. */
  limit?: number;
  /** Only include injuries occurred within this many days. Default 60. */
  days?: number;
}

@Injectable()
export class InjuryService {
  constructor(
    @InjectRepository(PlayerEntity)
    private playerRepo: Repository<PlayerEntity>,
    @InjectRepository(InjuryEntity)
    private injuryRepo: Repository<InjuryEntity>,
    @InjectRepository(StaffEntity)
    private staffRepo: Repository<StaffEntity>,
    @InjectRepository(MatchEntity)
    private matchRepo: Repository<MatchEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Resolve the active team doctor level (0 = none).
   * Used to feed the deterministic recovery formula.
   */
  private async getTeamDoctorLevel(teamId: string): Promise<number> {
    if (!teamId) return 0;
    const doctor = await this.staffRepo.findOne({
      where: {
        teamId,
        role: StaffRole.TEAM_DOCTOR,
        isActive: true,
      },
    });
    return doctor?.level ?? 0;
  }

  /**
   * Get a player's injury history
   */
  async getPlayerInjuryHistory(
    playerId: number,
  ): Promise<InjuryHistoryResDto[]> {
    const injuries = await this.injuryRepo.find({
      where: { playerId },
      order: { occurredAt: 'DESC' },
    });

    return injuries.map((injury) => ({
      id: injury.id,
      injuryType: injury.injuryType,
      severity: injury.severity,
      // min/max collapsed: take max (more conservative) as the single value.
      estimatedDays: injury.estimatedMaxDays,
      occurredAt: injury.occurredAt,
      recoveredAt: injury.recoveredAt ?? undefined,
      isRecovered: !!injury.recoveredAt,
      matchId: injury.matchId ?? null,
    }));
  }

  /**
   * Get all injured players for a team
   */
  async getTeamInjuredPlayers(
    teamId: string,
  ): Promise<PlayerInjuryStatusResDto[]> {
    const players = await this.playerRepo.find({
      where: { teamId, currentInjuryValue: MoreThanOrEqual(1) },
    });

    if (players.length === 0) return [];

    // Single batched doctor lookup — feeds the shared deterministic formula.
    const doctorLevel = await this.getTeamDoctorLevel(teamId);

    return players.map((player) => {
      const [years, days] = player.getExactAge();
      const playerAge = years + days / 112; // DAYS_PER_SEASON

      const estimated = estimateRecoveryDays(
        player.currentInjuryValue,
        playerAge,
        doctorLevel,
      );

      return {
        playerId: player.id,
        playerName: player.name,
        isInjured: true,
        currentInjuryValue: player.currentInjuryValue,
        injuryType: player.injuryType || undefined,
        injuryState: player.injuryState ?? null,
        injuredAt: player.injuredAt || undefined,
        estimatedRecoveryDays: estimated,
      };
    });
  }

  /**
   * Get recent injuries for every player currently belonging to the team.
   * Used by the Medical Room "Recent history" panel.
   *
   * Single JOIN query: `injury` ⋈ `player` filtered by `player.teamId`.
   * Keeps the "injuries follow the player on transfer" semantic without
   * a 2-step lookup + IN-subquery.
   */
  async getTeamInjuryHistory(
    teamId: string,
    options: TeamInjuryHistoryQuery = {},
  ): Promise<InjuryHistoryResDto[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
    const days = Math.max(1, Math.min(options.days ?? 60, 365));
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const injuries = await this.injuryRepo
      .createQueryBuilder('injury')
      .innerJoin('injury.player', 'player')
      .where('player.teamId = :teamId', { teamId })
      .andWhere('injury.occurredAt >= :cutoff', { cutoff })
      .orderBy('injury.occurredAt', 'DESC')
      .limit(limit)
      .getMany();

    if (injuries.length === 0) return [];

    // Resolve match → opponent name in a single batch.
    const matchIds = injuries
      .map((i) => i.matchId)
      .filter((id): id is string => !!id);
    const matches = matchIds.length
      ? await this.matchRepo.find({ where: { id: In(matchIds) as any } })
      : [];
    const matchById = new Map(matches.map((m) => [m.id, m]));

    return injuries.map((injury) => {
      const match = injury.matchId ? matchById.get(injury.matchId) : undefined;
      const opponent = match
        ? match.homeTeamId === teamId
          ? match.awayTeam?.name
          : match.homeTeam?.name
        : undefined;

      return {
        id: injury.id,
        injuryType: injury.injuryType,
        severity: injury.severity,
        estimatedDays: injury.estimatedMaxDays,
        occurredAt: injury.occurredAt,
        recoveredAt: injury.recoveredAt ?? undefined,
        isRecovered: !!injury.recoveredAt,
        matchId: injury.matchId ?? null,
        opponentName: opponent ?? null,
      };
    });
  }

  /**
   * Get all players with injuries that are pending recovery (for cron job)
   */
  async getPlayersPendingRecovery(): Promise<PlayerEntity[]> {
    return this.playerRepo.find({
      where: { currentInjuryValue: MoreThanOrEqual(1) },
    });
  }

  /**
   * Update a player's injury value (called by daily cron job)
   *
   * Wrapped in a single transaction so the player-side "currently injured"
   * cache and the active injury record can never drift apart — previously
   * these were two independent writes, which let a partial failure leave
   * the player marked injured with no matching active injury row (or
   * vice versa).
   */
  async updatePlayerInjury(
    playerId: number,
    recoveryValue: number,
  ): Promise<PlayerEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const playerRepo = manager.getRepository(PlayerEntity);
      const injuryRepo = manager.getRepository(InjuryEntity);

      const player = await playerRepo.findOneBy({ id: playerId });
      if (!player || player.currentInjuryValue <= 0) return null;

      const newValue = Math.max(0, player.currentInjuryValue - recoveryValue);

      // Check if player just recovered
      const wasInjured = player.currentInjuryValue > 0;
      const isNowRecovered = newValue === 0;

      player.currentInjuryValue = newValue;

      if (isNowRecovered && wasInjured) {
        player.injuryType = null;
        player.injuredAt = null;

        // Update the active injury record (recovery is derived from
        // `recoveredAt` being set — no separate boolean flag).
        const activeInjury = await injuryRepo.findOne({
          where: { playerId, recoveredAt: IsNull() },
          order: { occurredAt: 'DESC' },
        });

        if (activeInjury) {
          activeInjury.recoveredAt = new Date();
          await injuryRepo.save(activeInjury);
        }
      }

      return playerRepo.save(player);
    });
  }

  /**
   * Apply injury to a player (called after match simulation).
   *
   * Wrapped in a single transaction so the player-side "currently injured"
   * cache (currentInjuryValue / injuryType / injuredAt) and the new
   * injury history row commit atomically — see updatePlayerInjury for
   * the same rationale.
   */
  async applyInjury(
    playerId: number,
    injuryType: string,
    severity: number,
    injuryValue: number,
    estimatedDays: number,
    matchId?: string,
  ): Promise<InjuryEntity> {
    return this.dataSource.transaction(async (manager) => {
      const playerRepo = manager.getRepository(PlayerEntity);
      const injuryRepo = manager.getRepository(InjuryEntity);

      // Update player's "currently injured" cache.
      await playerRepo.update({ id: playerId } as any, {
        currentInjuryValue: injuryValue,
        injuryType: injuryType as any,
        injuredAt: new Date(),
      });

      // Create injury history record. `estimatedMinDays` and the
      // `is_recovered` boolean have been removed — see entity comments.
      const injury = injuryRepo.create({
        playerId,
        matchId,
        injuryType: injuryType as any,
        severity: severity as 1 | 2 | 3,
        injuryValue,
        estimatedMaxDays: estimatedDays,
        occurredAt: new Date(),
      });

      return injuryRepo.save(injury);
    });
  }

  /**
   * Get injured players count by team IDs
   */
  async getInjuredCountByTeamIds(
    teamIds: string[],
  ): Promise<Record<string, number>> {
    const result: Record<string, number> = {};

    for (const teamId of teamIds) {
      const count = await this.playerRepo.count({
        where: { teamId, currentInjuryValue: MoreThanOrEqual(1) },
      });
      result[teamId] = count;
    }

    return result;
  }
}
