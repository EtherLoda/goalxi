import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { PlayerEntity } from './player.entity';
import { TeamEntity } from './team.entity';
import { AuctionEntity } from './auction.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum TransferTransactionType {
    BUYOUT = 'BUYOUT',
    AUCTION_COMPLETE = 'AUCTION_COMPLETE',
}

export enum TransferTransactionStatus {
    PENDING = 'PENDING',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

@Entity('transfer_transaction')
export class TransferTransactionEntity extends AbstractEntity {
    constructor(data?: Partial<TransferTransactionEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_transfer_transaction_id' })
    id!: Uuid;

    @Column({ name: 'auction_id', type: 'uuid' })
    auctionId!: Uuid;

    @ManyToOne(() => AuctionEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'auction_id' })
    auction?: AuctionEntity;

    @Column({ name: 'player_id', type: 'int' })
    playerId!: number;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'from_team_id', type: 'uuid' })
    fromTeamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'from_team_id' })
    fromTeam?: TeamEntity;

    @Column({ name: 'to_team_id', type: 'uuid' })
    toTeamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'to_team_id' })
    toTeam?: TeamEntity;

    @Column({ type: 'integer' })
    amount!: number;

    @Column({ type: 'enum', enum: TransferTransactionType })
    type!: TransferTransactionType;

    @Column({ type: 'enum', enum: TransferTransactionStatus, default: TransferTransactionStatus.PENDING })
    status!: TransferTransactionStatus;

    @Column({ name: 'failure_reason', type: 'varchar', nullable: true })
    failureReason?: string;

    @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
    settledAt?: Date;

    /**
     * Timestamp at which a worker last claimed this row (moved it
     * PENDING → PROCESSING). Used by the worker to detect a stale
     * PROCESSING claim — a previous worker died mid-settlement and
     * a new worker should be able to take over without the auction
     * getting stuck forever. The "stale" window must comfortably
     * exceed the slowest possible settlement (Redis lock TTL is
     * 5 minutes, so 10 minutes is a safe margin).
     */
    @Column({ name: 'claimed_at', type: 'timestamptz', nullable: true })
    claimedAt?: Date | null;

    @Column({ type: 'integer' })
    season!: number;
}
