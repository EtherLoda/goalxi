import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('injury')
export class InjuryEntity extends AbstractEntity {
    constructor(data?: Partial<InjuryEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_injury_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'int' })
    playerId!: number;

    @ManyToOne('PlayerEntity', { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'player_id' })
    player?: import('./player.entity').PlayerEntity;

    @Column({ name: 'match_id', type: 'uuid', nullable: true })
    matchId?: string | null;

    @Column({ name: 'injury_type', type: 'varchar', length: 20 })
    injuryType!: 'muscle' | 'ligament' | 'joint' | 'head' | 'other';

    @Column({ name: 'severity', type: 'int' })
    severity!: 1 | 2 | 3;

    @Column({ name: 'injury_value', type: 'int' })
    injuryValue!: number;

    /**
     * Single deterministic recovery estimate (in days).
     * Column kept as `estimated_max_days` to minimise DB churn — the
     * previous `min` column was always written with the same value, so
     * it carried no extra information. See migration
     * `1726000000000-DropInjuryRedundantColumns` for the column drop.
     */
    @Column({ name: 'estimated_max_days', type: 'int' })
    estimatedMaxDays!: number;

    @Column({ name: 'occurred_at', type: 'timestamptz' })
    occurredAt!: Date;

    @Column({ name: 'recovered_at', type: 'timestamptz', nullable: true })
    recoveredAt?: Date | null;

    /**
     * Derived: an injury is "recovered" iff `recoveredAt` is set.
     * The previous `is_recovered` boolean column was redundant with this
     * timestamp and prone to drift; it was removed in migration
     * `1726000000000-DropInjuryRedundantColumns`. Callers should compute
     * `!!recoveredAt` instead of reading a stored flag.
     */
}
