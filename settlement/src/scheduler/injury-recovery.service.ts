import {Injectable, Logger, Inject } from '@nestjs/common';
import { LOGGER_SERVICE, PinoLoggerService } from '@goalxi/logger';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
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
  @Cron('0 0 2 * * *')
  async processDailyInjuryRecovery() {
    const now = new Date();
    this.logger.info(
      `[InjuryRecovery] Running daily injury recovery at ${now.toISOString()}`,
    );

    const injuredPlayers = await this.playerRepository.find({
      where: { currentInjuryValue: MoreThanOrEqual(1) },
    });

    this.logger.info(
      `[InjuryRecovery] Found ${injuredPlayers.length} player(s) with active injuries`,
    );

    const playersToSave: PlayerEntity[] = [];
    const injuriesToRecover: {
      playerId: string;
      playerName: string;
      oldValue: number;
    }[] = [];

    for (const player of injuredPlayers) {
      // Skip bot team players - their injuries don't recover automatically
      const team = await this.teamRepository.findOne({
        where: { id: player.teamId as Uuid },
      });
      if (team?.isBot) {
        this.logger.debug(
          `[InjuryRecovery] Skipping bot player: ${player.name}`,
        );
        continue;
      }

      try {
        // Calculate fractional age: years + days / DAYS_PER_SEASON
        // A season has 16 weeks Ã— 7 days = 112 days
        const DAYS_PER_SEASON = 112;
        const [years, days] = player.getExactAge();
        const playerAge = years + days / DAYS_PER_SEASON;

        let doctorLevel = 0;
        if (player.teamId) {
          const teamDoctor = await this.staffRepository.findOne({
            where: {
              teamId: player.teamId,
              role: StaffRole.TEAM_DOCTOR,
              isActive: true,
            },
          });
          if (teamDoctor) {
            doctorLevel = teamDoctor.level;
          }
        }

        // Deterministic daily recovery â€?shared formula (no random fluctuation).
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

    // Batch save all players with updated injury values
    if (playersToSave.length > 0) {
      await this.playerRepository.save(playersToSave);
      this.logger.debug(
        `[InjuryRecovery] Batch saved ${playersToSave.length} players`,
      );
    }

    // Process recovered injuries
    let recoveredCount = 0;
    for (const { playerId, playerName, oldValue } of injuriesToRecover) {
      const activeInjury = await this.injuryRepository.findOne({
        where: { playerId: playerId as Uuid, isRecovered: false },
        order: { occurredAt: 'DESC' },
      });

      if (activeInjury) {
        activeInjury.isRecovered = true;
        activeInjury.recoveredAt = new Date();
        await this.injuryRepository.save(activeInjury);
      }

      // Clear injury fields on the player
      const player = playersToSave.find((p) => p.id === playerId);
      if (player) {
        player.injuryType = null;
        player.injuryState = null;
        player.injuredAt = null;
      }

      // Send recovery notification
      const playerWithTeam = await this.playerRepository.findOne({
        where: { id: playerId as Uuid },
        relations: ['team'],
      });
      if (playerWithTeam?.team?.userId) {
        await this.notificationService.create(
          playerWithTeam.team.userId,
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

    // Save players with cleared injury fields
    const recoveredPlayers = playersToSave.filter((p) =>
      injuriesToRecover.some((r) => r.playerId === p.id),
    );
    if (recoveredPlayers.length > 0) {
      await this.playerRepository.save(recoveredPlayers);
    }

    this.logger.info(
      `[InjuryRecovery] Completed. ${recoveredCount} player(s) fully recovered today.`,
    );
  }
}
