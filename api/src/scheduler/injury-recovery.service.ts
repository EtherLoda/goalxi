import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerEntity, InjuryEntity } from '@goalxi/database';

@Injectable()
export class InjuryRecoveryService {
    private readonly logger = new Logger(InjuryRecoveryService.name);

    constructor(
        @InjectRepository(PlayerEntity)
        private playerRepository: Repository<PlayerEntity>,
        @InjectRepository(InjuryEntity)
        private injuryRepository: Repository<InjuryEntity>,
    ) { }

    // ===== SCHEDULER: Daily Injury Recovery =====
    // Run at 2 AM every day
    @Cron('0 0 2 * * *')
    async processDailyInjuryRecovery() {
        const now = new Date();
        this.logger.log(`[InjuryRecovery] Running daily injury recovery at ${now.toISOString()}`);

        // Get all players with active injuries
        const injuredPlayers = await this.playerRepository.find({
            where: { currentInjuryValue: 1 }, // Greater than 0
        });

        this.logger.log(`[InjuryRecovery] Found ${injuredPlayers.length} player(s) with active injuries`);

        let recoveredCount = 0;

        for (const player of injuredPlayers) {
            try {
                const playerAge = player.age || 25;

                // Calculate daily recovery using sigmoid function (same as simulator)
                // Sigmoid: base + amplitude / (1 + exp(k * (age - midpoint)))
                // Negative exponent to make younger players recover faster
                const midpoint = 28;
                const k = 0.25;
                const base = 3;
                const amplitude = 9;

                const sigmoid = base + amplitude / (1 + Math.exp(k * (playerAge - midpoint)));
                const fluctuation = 0.85 + Math.random() * 0.3;
                const dailyRecovery = Math.round(sigmoid * fluctuation * 10) / 10;

                const oldValue = player.currentInjuryValue;
                const newValue = Math.max(0, oldValue - dailyRecovery);

                player.currentInjuryValue = newValue;
                await this.playerRepository.save(player);

                // Check if player just recovered
                if (newValue === 0 && oldValue > 0) {
                    // Update the active injury record
                    const activeInjury = await this.injuryRepository.findOne({
                        where: { playerId: player.id, isRecovered: false },
                        order: { occurredAt: 'DESC' },
                    });

                    if (activeInjury) {
                        activeInjury.isRecovered = true;
                        activeInjury.recoveredAt = new Date();
                        await this.injuryRepository.save(activeInjury);
                    }

                    // Clear injury fields on player
                    player.injuryType = null;
                    player.injuredAt = null;
                    await this.playerRepository.save(player);

                    recoveredCount++;
                    this.logger.log(
                        `[InjuryRecovery] ✅ Player ${player.name} (${player.id}) has fully recovered! ` +
                        `(injuryValue: ${oldValue} -> 0)`
                    );
                } else {
                    this.logger.debug(
                        `[InjuryRecovery] Player ${player.name}: ${oldValue} -> ${newValue} (daily recovery: ${dailyRecovery})`
                    );
                }
            } catch (error) {
                this.logger.error(
                    `[InjuryRecovery] Error processing injury recovery for player ${player.id}:`,
                    error
                );
            }
        }

        this.logger.log(
            `[InjuryRecovery] Completed. ${recoveredCount} player(s) fully recovered today.`
        );
    }
}
