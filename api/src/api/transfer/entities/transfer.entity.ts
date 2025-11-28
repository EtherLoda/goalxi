import { Uuid } from '@/common/types/common.type';
import { AbstractEntity } from '@/database/entities/abstract.entity';
import { PlayerEntity } from '@/api/player/entities/player.entity';
import { TeamEntity } from '@/api/team/entities/team.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum TransferStatus {
    LISTED = 'LISTED',
    PENDING = 'PENDING',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

@Entity('transfer')
export class TransferEntity extends AbstractEntity {
    constructor(data?: Partial<TransferEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_transfer_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'from_team_id', type: 'uuid' })
    fromTeamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'from_team_id' })
    fromTeam?: TeamEntity;

    @Column({ name: 'to_team_id', type: 'uuid', nullable: true })
    toTeamId?: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'to_team_id' })
    toTeam?: TeamEntity;

    @Column({ type: 'integer' })
    price!: number;

    @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.LISTED })
    status!: TransferStatus;

    @Column({ type: 'timestamptz', nullable: true })
    completedAt?: Date;
}
