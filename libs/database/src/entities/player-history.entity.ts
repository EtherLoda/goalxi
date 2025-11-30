import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { PlayerEntity } from './player.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum PlayerHistoryType {
    TRANSFER = 'TRANSFER',
    CONTRACT_RENEWAL = 'CONTRACT_RENEWAL',
    AWARD = 'AWARD',
    INJURY = 'INJURY',
    DEBUT = 'DEBUT',
}

@Entity('player_history')
export class PlayerHistoryEntity extends AbstractEntity {
    constructor(data?: Partial<PlayerHistoryEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_player_history_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ type: 'integer' })
    season!: number;

    @Column({ type: 'timestamptz' })
    date!: Date;

    @Column({ type: 'enum', enum: PlayerHistoryType })
    eventType!: PlayerHistoryType;

    @Column({ type: 'jsonb', nullable: true })
    details?: any;
}
