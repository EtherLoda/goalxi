import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, LessThanOrEqual, In } from 'typeorm';
import { Uuid } from '@/common/types/common.type';
import { PlayerEntity } from '@goalxi/database';
import { InjuryEntity } from '@goalxi/database';

export interface InjuryHistoryResDto {
    id: string;
    injuryType: string;
    severity: number;
    estimatedMinDays: number;
    estimatedMaxDays: number;
    occurredAt: Date;
    recoveredAt?: Date;
    isRecovered: boolean;
}

export interface PlayerInjuryStatusResDto {
    playerId: string;
    playerName: string;
    isInjured: boolean;
    currentInjuryValue: number;
    injuryType?: string;
    injuredAt?: Date;
    estimatedRecoveryDays?: {
        min: number;
        max: number;
    };
}

@Injectable()
export class InjuryService {
    constructor(
        @InjectRepository(PlayerEntity)
        private playerRepo: Repository<PlayerEntity>,
        @InjectRepository(InjuryEntity)
        private injuryRepo: Repository<InjuryEntity>,
    ) { }

    /**
     * Get a player's injury history
     */
    async getPlayerInjuryHistory(playerId: string): Promise<InjuryHistoryResDto[]> {
        const injuries = await this.injuryRepo.find({
            where: { playerId: playerId as Uuid },
            order: { occurredAt: 'DESC' },
        });

        return injuries.map(injury => ({
            id: injury.id,
            injuryType: injury.injuryType,
            severity: injury.severity,
            estimatedMinDays: injury.estimatedMinDays,
            estimatedMaxDays: injury.estimatedMaxDays,
            occurredAt: injury.occurredAt,
            recoveredAt: injury.recoveredAt,
            isRecovered: injury.isRecovered,
        }));
    }

    /**
     * Get all injured players for a team
     */
    async getTeamInjuredPlayers(teamId: string): Promise<PlayerInjuryStatusResDto[]> {
        const players = await this.playerRepo.find({
            where: { teamId, currentInjuryValue: MoreThanOrEqual(1) },
        });

        const result: PlayerInjuryStatusResDto[] = [];

        for (const player of players) {
            // Calculate estimated days based on current injury value
            // Recovery range comes from daily random fluctuation (3-12 range with ±15%)
            const minDailyRecovery = 3 * 0.85;
            const maxDailyRecovery = 12 * 1.15;

            const minDays = Math.ceil(player.currentInjuryValue / maxDailyRecovery);
            const maxDays = Math.ceil(player.currentInjuryValue / minDailyRecovery);

            result.push({
                playerId: player.id,
                playerName: player.name,
                isInjured: true,
                currentInjuryValue: player.currentInjuryValue,
                injuryType: player.injuryType || undefined,
                injuredAt: player.injuredAt || undefined,
                estimatedRecoveryDays: {
                    min: Math.max(1, minDays),
                    max: Math.max(1, maxDays),
                },
            });
        }

        return result;
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
     */
    async updatePlayerInjury(playerId: string, recoveryValue: number): Promise<PlayerEntity | null> {
        const player = await this.playerRepo.findOneBy({ id: playerId as Uuid });
        if (!player || player.currentInjuryValue <= 0) return null;

        const newValue = Math.max(0, player.currentInjuryValue - recoveryValue);

        // Check if player just recovered
        const wasInjured = player.currentInjuryValue > 0;
        const isNowRecovered = newValue === 0;

        player.currentInjuryValue = newValue;

        if (isNowRecovered && wasInjured) {
            player.injuryType = null;
            player.injuredAt = null;

            // Update the injury record
            const activeInjury = await this.injuryRepo.findOne({
                where: { playerId: playerId as Uuid, isRecovered: false },
                order: { occurredAt: 'DESC' },
            });

            if (activeInjury) {
                activeInjury.isRecovered = true;
                activeInjury.recoveredAt = new Date();
                await this.injuryRepo.save(activeInjury);
            }
        }

        await this.playerRepo.save(player);
        return player;
    }

    /**
     * Apply injury to a player (called after match simulation)
     */
    async applyInjury(
        playerId: string,
        injuryType: string,
        severity: number,
        injuryValue: number,
        estimatedMinDays: number,
        estimatedMaxDays: number,
        matchId?: string
    ): Promise<InjuryEntity> {
        // Update player
        await this.playerRepo.update(playerId, {
            currentInjuryValue: injuryValue,
            injuryType: injuryType as any,
            injuredAt: new Date(),
        });

        // Create injury record
        const injury = this.injuryRepo.create({
            playerId,
            matchId,
            injuryType: injuryType as any,
            severity: severity as 1 | 2 | 3,
            injuryValue,
            estimatedMinDays,
            estimatedMaxDays,
            occurredAt: new Date(),
            isRecovered: false,
        });

        return this.injuryRepo.save(injury);
    }

    /**
     * Get injured players count by team IDs
     */
    async getInjuredCountByTeamIds(teamIds: string[]): Promise<Record<string, number>> {
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
