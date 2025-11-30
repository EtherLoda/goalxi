import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TransactionType } from '../constants/finance.constants';

@Entity('transaction')
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
    amount!: number;

    @Column({ type: 'enum', enum: TransactionType })
    type!: TransactionType;
}
