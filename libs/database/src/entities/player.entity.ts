import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { TeamEntity } from './team.entity';
import {
    Column,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('player')
export class PlayerEntity extends AbstractEntity {
    constructor(data?: Partial<PlayerEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_player_id' })
    id!: Uuid;

    @Column({ name: 'team_id', type: 'uuid', nullable: true })
    teamId?: string | null;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column()
    name!: string;

    @Column({ nullable: true })
    birthday?: Date;

    @Column({ type: 'jsonb', default: {} })
    appearance!: Record<string, any>;

    @Column({ nullable: true })
    position?: string;

    @Column({ name: 'is_goalkeeper', default: false })
    isGoalkeeper!: boolean;

    @Column({ name: 'on_transfer', default: false })
    onTransfer!: boolean;

    @Column({ type: 'jsonb' })
    attributes!: Record<string, any>;

    @Column({ type: 'float', default: 0.0 })
    experience!: number;

    @Column({ type: 'integer', default: 5 })
    form!: number;

    @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
    deletedAt?: Date;
}
