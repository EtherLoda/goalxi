import {
  GAME_SETTINGS,
  InjuryEntity,
  MatchEntity,
  PlayerEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
  Uuid,
  estimateRecoveryDays,
} from '@goalxi/database';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';

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

/**
 * Read-side API surface for the Medical Room.
 *
 * The write paths (apply injuries, recover players) live in
 * `libs/database/src/services/injury-recovery-calculator.ts` as
 * `applyInjuryBatch` and `applyDailyInjuryRecovery`. The simulator
 * and the daily-recovery cron call those helpers directly so the
 * service stays a thin read-side wrapper (2026-08-06 P0-#2).
 */
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
    @InjectRepository(TeamEntity)
    private teamRepo: Repository<TeamEntity>,
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
   * Assert that the user owns the given team. Throws
   * `ForbiddenException` otherwise.
   *
   * Shared across the read-side endpoints in this controller
   * (and any future write path that should be team-scoped).
   * Mirrors `MatchService.validateTeamOwnership` — kept here
   * to avoid a cross-module import from the medical module.
   */
  async assertUserOwnsTeam(userId: Uuid, teamId: Uuid): Promise<void> {
    const team = await this.teamRepo.findOne({
      where: { id: teamId as Uuid, userId },
    });
    if (!team) {
      throw new ForbiddenException('User does not own this team');
    }
  }

  /**
   * Assert that the user owns the team the given player
   * currently belongs to. Players without a team (free
   * agents) are rejected — there's no team to authorize against.
   */
  async assertUserOwnsPlayer(userId: Uuid, playerId: number): Promise<void> {
    const player = await this.playerRepo.findOne({
      where: { id: playerId },
      select: { id: true, teamId: true },
    });
    if (!player || !player.teamId) {
      throw new ForbiddenException(
        'Player is not on a team owned by this user',
      );
    }
    await this.assertUserOwnsTeam(userId, player.teamId as Uuid);
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
      // Use `GAME_SETTINGS.DAYS_PER_YEAR` (the same value, just
      // routed through the single source of truth). P1-#5.
      const playerAge = years + days / GAME_SETTINGS.DAYS_PER_YEAR;

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
      ? await this.matchRepo.find({ where: { id: In(matchIds) } })
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
}
