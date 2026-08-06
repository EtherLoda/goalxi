import { Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, IsNull, In } from 'typeorm';
import {
  PlayerEntity,
  InjuryEntity,
  StaffEntity,
  StaffRole,
  TeamEntity,
  Uuid,
  calculateDailyRecovery,
  estimateRecoveryDays,
} from '@goalxi/database';
import {
  NotificationService,
  NotificationType,
} from '../notification/notification.service';

@Injectable()
export class InjuryRecoveryService {
  constructor(
    @Inject(LOGGER_SERVICE)
    private readonly logger: PinoLoggerService,
    @InjectRepository(PlayerEntity)
    private playerRepository: Repository<PlayerEntity>,
    @InjectRepository(InjuryEntity)
    private injuryRepository: Repository<InjuryEntity>,
    @InjectRepository(StaffEntity)
    private staffRepository: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepository: Repository<TeamEntity>,
    private readonly notificationService: NotificationService,
  ) {}

  // ===== SCHEDULER: Daily Injury Recovery =====
  // Run at 2 AM every day
  //
  // Query budget (independent of N injured / M recovered):
  //   1. injured players + their team  (was: 1 + N + N)
  //   2. active team doctors in those teams  (was: N)
  //   3. active injuries for recovered players  (was: M)
  //   4. recovered players + their team  (was: M)
  // Previously each injured player triggered 2 extra queries
  // (team, then doctor); each recovered player triggered 2 more
  // (active injury, then player+team for notification).
  @Cron('0 0 2 * * *')
  async processDailyInjuryRecovery() {
    const now = new Date();
    this.logger.info(
      `[InjuryRecovery] Running daily injury recovery at ${now.toISOString()}`,
    );

    // 1. Pull injured players with their team in a single query.
    // We need `team` to decide bot-skip and to know the userId
    // for notifications later.
    const injuredPlayers = await this.playerRepository.find({
      where: { currentInjuryValue: MoreThanOrEqual(1) },
      relations: ['team'],
    });

    this.logger.info(
      `[InjuryRecovery] Found ${injuredPlayers.length} player(s) with active injuries`,
    );

    if (injuredPlayers.length === 0) {
      return;
    }

    // 2. Collect non-bot team ids so we can pull their doctors
    // in one query instead of N.
    const activeTeamIds = new Set<Uuid>();
    for (const p of injuredPlayers) {
      if (p.teamId && p.team && !p.team.isBot) {
        activeTeamIds.add(p.teamId as Uuid);
      }
    }

    let doctorByTeam = new Map<Uuid, StaffEntity>();
    if (activeTeamIds.size > 0) {
      const doctors = await this.staffRepository.find({
        where: {
          teamId: In(Array.from(activeTeamIds)),
          role: StaffRole.TEAM_DOCTOR,
          isActive: true,
        },
      });
      for (const d of doctors) {
        doctorByTeam.set(d.teamId as Uuid, d);
      }
    }

    const playersToSave: PlayerEntity[] = [];
    const injuriesToRecover: {
      playerId: number;
      playerName: string;
      oldValue: number;
    }[] = [];

    for (const player of injuredPlayers) {
      // Skip players without a team (free agents) and bot-team players —
      // their injuries don't recover automatically.
      const team = player.team;
      if (!team || team.isBot) {
        if (team?.isBot) {
          this.logger.debug(
            `[InjuryRecovery] Skipping bot player: ${player.name}`,
          );
        }
        continue;
      }

      try {
        // Calculate fractional age: years + days / DAYS_PER_SEASON
        // A season has 16 weeks × 7 days = 112 days
        const DAYS_PER_SEASON = 112;
        const [years, days] = player.getExactAge();
        const playerAge = years + days / DAYS_PER_SEASON;

        // O(1) lookup from the pre-loaded map. Defaults to 0
        // (no active doctor) — same fallback as the old code.
        const teamDoctor = doctorByTeam.get(team.id);
        const doctorLevel = teamDoctor?.level ?? 0;

        // Deterministic daily recovery — shared formula (no random fluctuation).
        const dailyRecovery = calculateDailyRecovery(playerAge, doctorLevel);

        const oldValue = player.currentInjuryValue;
        const newValue = Math.max(0, oldValue - dailyRecovery);

        // Estimate remaining recovery days based on the same deterministic formula.
        const estimatedDays = estimateRecoveryDays(
          newValue,
          playerAge,
          doctorLevel,
        );

        // If estimated recovery time <= 7 days, set to minor injury (can play with 95% ability)
        if (newValue > 0 && newValue <= 30 && estimatedDays <= 7) {
          player.injuryState = 'minor';
          this.logger.debug(
            `[InjuryRecovery] Player ${player.name}: ${oldValue} -> ${newValue} (minor injury, ~${estimatedDays} days)`,
          );
        }

        player.currentInjuryValue = newValue;
        playersToSave.push(player);

        if (newValue === 0 && oldValue > 0) {
          injuriesToRecover.push({
            playerId: player.id,
            playerName: player.name,
            oldValue,
          });
        } else {
          this.logger.debug(
            `[InjuryRecovery] Player ${player.name}: ${oldValue} -> ${newValue} (daily recovery: ${dailyRecovery})`,
          );
        }
      } catch (error) {
        this.logger.error(
          `[InjuryRecovery] Error processing injury recovery for player ${player.id}:`,
          error,
        );
      }
    }

    // 3. Batch-save all dirty players in one shot (replaces N
    // single-row saves).
    if (playersToSave.length > 0) {
      await this.playerRepository.save(playersToSave);
      this.logger.debug(
        `[InjuryRecovery] Batch saved ${playersToSave.length} players`,
      );
    }

    if (injuriesToRecover.length === 0) {
      this.logger.info(
        `[InjuryRecovery] Completed. 0 player(s) fully recovered today.`,
      );
      return;
    }

    // 4. Pull all active injuries for the recovered players in
    // one query (was: one per recovered player).
    const recoveredPlayerIds = injuriesToRecover.map((r) => r.playerId);
    const activeInjuries = await this.injuryRepository.find({
      where: {
        playerId: In(recoveredPlayerIds),
        recoveredAt: IsNull(),
      },
      order: { occurredAt: 'DESC' },
    });
    // Group by playerId; the most recent (DESC order) is the
    // "active" injury we want to stamp recoveredAt on.
    const activeInjuryByPlayer = new Map<number, InjuryEntity>();
    for (const inj of activeInjuries) {
      if (!activeInjuryByPlayer.has(inj.playerId)) {
        activeInjuryByPlayer.set(inj.playerId, inj);
      }
    }
    for (const inj of activeInjuries) {
      inj.recoveredAt = now;
    }
    if (activeInjuries.length > 0) {
      await this.injuryRepository.save(activeInjuries);
    }

    // 5. Pull the recovered players again, this time with their
    // team inlined, so notifications can use the userId without
    // a per-player findOne.
    const recoveredPlayers = await this.playerRepository.find({
      where: { id: In(recoveredPlayerIds) },
      relations: ['team'],
    });
    const recoveredPlayerById = new Map<number, PlayerEntity>();
    for (const p of recoveredPlayers) {
      recoveredPlayerById.set(p.id, p);
    }

    let recoveredCount = 0;
    for (const { playerId, playerName, oldValue } of injuriesToRecover) {
      const player = recoveredPlayerById.get(playerId);
      if (player) {
        player.injuryType = null;
        player.injuryState = null;
        player.injuredAt = null;
      }

      const activeInjury = activeInjuryByPlayer.get(playerId);

      if (player?.team?.userId) {
        await this.notificationService.create(
          player.team.userId,
          NotificationType.PLAYER_RECOVERED,
          'notification.playerRecovered',
          {
            playerId,
            playerName,
            injuryType: activeInjury?.injuryType,
          },
        );
      }

      recoveredCount++;
      this.logger.info(
        `[InjuryRecovery] Player ${playerName} (${playerId}) has fully recovered! (injuryValue: ${oldValue} -> 0)`,
      );
    }

    // 6. Save the cleared fields in a single batched UPDATE.
    if (recoveredPlayers.length > 0) {
      await this.playerRepository.save(recoveredPlayers);
    }

    this.logger.info(
      `[InjuryRecovery] Completed. ${recoveredCount} player(s) fully recovered today.`,
    );
  }
}
