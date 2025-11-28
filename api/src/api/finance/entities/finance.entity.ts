import { Uuid } from '@/common/types/common.type';
import { AbstractEntity } from '@/database/entities/abstract.entity';
import { TeamEntity } from '@/api/team/entities/team.entity';
import { Column, Entity, JoinColumn, OneToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('finance')
export class FinanceEntity extends AbstractEntity {
    constructor(data?: Partial<FinanceEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_finance_id' })
    id!: Uuid;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: Uuid;

    @OneToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ type: 'integer', default: 100000 })
    balance!: number;
}
