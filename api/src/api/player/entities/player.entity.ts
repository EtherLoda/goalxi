import { Uuid } from '@/common/types/common.type';
import { AbstractEntity } from '@/database/entities/abstract.entity';
import {
    Column,
    DeleteDateColumn,
    Entity,
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

    @Column()
    name!: string;

    @Column({ nullable: true })
    birthday?: Date;

    @Column({ default: '' })
    avatar!: string;

    @Column({ nullable: true })
    position?: string;

    @Column({ name: 'is_goalkeeper', default: false })
    isGoalkeeper!: boolean;

    @Column({ name: 'on_transfer', default: false })
    onTransfer!: boolean;

    @Column({ type: 'jsonb' })
    attributes!: Record<string, any>;

    @DeleteDateColumn({
        name: 'deleted_at',
        type: 'timestamptz',
        default: null,
    })
    deletedAt: Date;
}
