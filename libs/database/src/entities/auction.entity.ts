import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { PlayerEntity } from './player.entity';
import { TeamEntity } from './team.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

export enum AuctionStatus {
    ACTIVE = 'ACTIVE',
    SOLD = 'SOLD',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED',
}

export interface BidRecord {
    teamId: string;
    amount: number;
    timestamp: string;
}

@Entity('auction')
export class AuctionEntity extends AbstractEntity {
    constructor(data?: Partial<AuctionEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_auction_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'team_id', type: 'uuid' })
    teamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ name: 'start_price', type: 'integer' })
    startPrice!: number;

    @Column({ name: 'buyout_price', type: 'integer' })
    buyoutPrice!: number;

    @Column({ name: 'current_price', type: 'integer' })
    currentPrice!: number;

    @Column({ name: 'current_bidder_id', type: 'uuid', nullable: true })
    currentBidderId?: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'current_bidder_id' })
    currentBidder?: TeamEntity;

    @Column({ name: 'started_at', type: 'timestamptz' })
    startedAt!: Date;

    @Column({ name: 'expires_at', type: 'timestamptz' })
    expiresAt!: Date;

    @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
    endsAt?: Date;

    @Column({ name: 'bid_history', type: 'jsonb', default: [] })
    bidHistory!: BidRecord[];

    @Column({ type: 'enum', enum: AuctionStatus, default: AuctionStatus.ACTIVE })
    status!: AuctionStatus;
}
