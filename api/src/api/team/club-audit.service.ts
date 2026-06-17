import { TransactionEntity, TransactionType, Uuid } from '@goalxi/database';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { TeamEntity } from '@goalxi/database';

/**
 * Single audit entry for the Club Settings page timeline.
 *
 * Sourced from the existing `transaction` table so we don't need a new table.
 * The description field is the source of truth for stadium/club events.
 */
export interface ClubAuditEntry {
    id: string;
    type:
        | 'stadium_build'
        | 'stadium_demolish'
        | 'stadium_rename'
        | 'training_change'
        | 'name_change'
        | 'logo_change'
        | 'jersey_change'
        | 'unknown';
    season: number;
    week: number;
    description: string;
    cost?: number;
    createdAt: string;
}

@Injectable()
export class ClubAuditService {
    private static readonly LIMIT = 20;

    constructor(
        @InjectRepository(TransactionEntity)
        private readonly transactionRepo: Repository<TransactionEntity>,
        @InjectRepository(TeamEntity)
        private readonly teamRepo: Repository<TeamEntity>,
    ) {}

    async getRecent(teamId: string): Promise<ClubAuditEntry[]> {
        // Ensure team exists
        const team = await this.teamRepo.findOne({ where: { id: teamId as Uuid } });
        if (!team) {
            throw new NotFoundException(`Team ${teamId} not found`);
        }

        // 1) Stadium / club-level finance events live on the transaction table.
        const financeEvents = await this.transactionRepo.find({
            where: {
                teamId: teamId as Uuid,
                type: TransactionType.OTHER_EXPENSE,
                description: Like('Stadium%'),
            },
            order: { createdAt: 'DESC' },
            take: ClubAuditService.LIMIT,
        });

        const entries: ClubAuditEntry[] = financeEvents.map((tx) => ({
            id: tx.id,
            type: this.classifyFinance(tx.description ?? ''),
            season: tx.season,
            week: tx.week,
            description: tx.description ?? '',
            cost: tx.amount,
            createdAt: tx.createdAt instanceof Date
                ? tx.createdAt.toISOString()
                : String(tx.createdAt),
        }));

        return entries
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, ClubAuditService.LIMIT);
    }

    private classifyFinance(desc: string): ClubAuditEntry['type'] {
        if (desc.startsWith('Stadium construction')) return 'stadium_build';
        if (desc.startsWith('Stadium demolition')) return 'stadium_demolish';
        if (desc.startsWith('Stadium rename')) return 'stadium_rename';
        return 'unknown';
    }
}
