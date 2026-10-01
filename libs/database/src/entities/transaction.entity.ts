import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TransactionType } from '../constants/finance.constants';

/**
 * `(season, team_id)` serves the season-end archive scan
 * (`SeasonArchiveService.archiveTransactions` does
 * `find({ where: { season } })` over 200k-400k rows per season).
 * The column is an `integer`, and no FK or index existed on it.
 * See migration 1788000000020.
 */
@Entity('transaction')
@Index(['season', 'teamId'])
export class TransactionEntity extends AbstractEntity {
    constructor(data?: Partial<TransactionEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_transaction_id' })
    id!: Uuid;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ type: 'integer' })
    season!: number;

    @Column({ type: 'integer' })
    week!: number;

    @Column({ type: 'integer' })
    amount!: number;

    @Column({ type: 'enum', enum: TransactionType })
    type!: TransactionType;

    @Column({ type: 'varchar', nullable: true })
    description?: string;

    @Column({ name: 'related_id', type: 'uuid', nullable: true })
    relatedId?: string;
}
