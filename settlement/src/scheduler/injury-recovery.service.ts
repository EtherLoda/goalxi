import { Injectable, Logger } from '@nestjs/common';
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
} from '@goalxi/database';

@Injectable()
export class InjuryRecoveryService {
  private readonly logger = new Logger(InjuryRecoveryService.name);

  constructor(
    @InjectRepository(PlayerEntity)
    private playerRepository: Repository<PlayerEntity>,
    @InjectRepository(InjuryEntity)
    private injuryRepository: Repository<InjuryEntity>,
    @InjectRepository(StaffEntity)
    private staffRepository: Repository<StaffEntity>,
    @InjectRepository(TeamEntity)
    private teamRepository: Repository<TeamEntity>,
  ) {}

  // ===== SCHEDULER: Daily Injury Recovery =====
  // Run at 2 AM every day
  @Cron('0 0 2 * * *')
  async processDailyInjuryRecovery() {
    const now = new Date();
    this.logger.log(
      `[InjuryRecovery] Running daily injury recovery at ${now.toISOString()}`,
    );

    const injuredPlayers = await this.playerRepository.find({
      where: { currentInjuryValue: MoreThanOrEqual(1) },
    });

    this.logger.log(
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
        // A season has 16 weeks × 7 days = 112 days
        const DAYS_PER_SEASON = 112;
        const [years, days] = player.getExactAge();
        const playerAge = years + days / DAYS_PER_SEASON;

        let doctorBonus = 1;
        if (player.teamId) {
          const teamDoctor = await this.staffRepository.findOne({
            where: {
              teamId: player.teamId,
              role: StaffRole.TEAM_DOCTOR,
              isActive: true,
            },
          });
          if (teamDoctor) {
            doctorBonus = 1 + teamDoctor.level * 0.1;
          }
        }

        // Sigmoid recovery formula: base + amplitude / (1 + exp(k * (age - midpoint)))
        // - midpoint=28: recovery peaks around age 28
        // - k=0.25: curve steepness
        // - base=3: minimum daily recovery (days)
        // - amplitude=9: maximum additional recovery above base
        // Formula produces: young players ~12, peak ~10, older ~3-5
        const midpoint = 28;
        const k = 0.25;
        const base = 3;
        const amplitude = 9;

        const sigmoid =
          base + amplitude / (1 + Math.exp(k * (playerAge - midpoint)));
        // Random fluctuation factor: 0.85 to 1.15
        const fluctuation = 0.85 + Math.random() * 0.3;
        const dailyRecovery =
          Math.round(sigmoid * fluctuation * 10 * doctorBonus) / 10;

        const oldValue = player.currentInjuryValue;
        const newValue = Math.max(0, oldValue - dailyRecovery);

        // Estimate recovery days based on current injury value
        // maxDailyRecovery = 12 * 1.15 ≈ 13.8
        const maxDailyRecovery = 12 * 1.15;
        const estimatedMaxDays = newValue / maxDailyRecovery;

        // If estimated recovery time <= 7 days, set to minor injury (can play with 95% ability)
        if (newValue > 0 && newValue <= 30 && estimatedMaxDays <= 7) {
          player.injuryState = 'minor';
          this.logger.debug(
            `[InjuryRecovery] Player ${player.name}: ${oldValue} -> ${newValue} (minor injury, ~${estimatedMaxDays.toFixed(1)} days)`,
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

      recoveredCount++;
      this.logger.log(
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

    this.logger.log(
      `[InjuryRecovery] Completed. ${recoveredCount} player(s) fully recovered today.`,
    );
  }
}
