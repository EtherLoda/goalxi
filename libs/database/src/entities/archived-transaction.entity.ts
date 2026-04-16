import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';
import { TransactionType } from '../constants/finance.constants';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('archived_transaction')
@Index(['teamId', 'season'])
@Index(['season', 'type'])
export class ArchivedTransactionEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_archived_transaction_id' })
    id!: Uuid;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ type: 'int' })
    season!: number;

    @Column({ type: 'int' })
    amount!: number;

    @Column({ type: 'enum', enum: TransactionType })
    type!: TransactionType;

    @Column({ type: 'varchar', nullable: true })
    description?: string;

    @Column({ name: 'related_id', type: 'uuid', nullable: true })
    relatedId?: string;

    @Column({ name: 'archived_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    archivedAt!: Date;
}
