import { Uuid } from '@/common/types/common.type';
import { AbstractEntity } from '@/database/entities/abstract.entity';
import { PlayerEntity } from '@/api/player/entities/player.entity';
import { TeamEntity } from '@/api/team/entities/team.entity';
import { AuctionEntity } from './auction.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('player_transaction')
export class PlayerTransactionEntity extends AbstractEntity {
    constructor(data?: Partial<PlayerTransactionEntity>) {
        super();
        Object.assign(this, data);
    }

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

    @Column({ name: 'to_team_id', type: 'uuid' })
    toTeamId!: Uuid;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'to_team_id' })
    toTeam?: TeamEntity;

    @Column({ type: 'integer' })
    price!: number;

    @Column({ type: 'integer' })
    season!: number;

    @Column({ name: 'transaction_date', type: 'timestamptz' })
    transactionDate!: Date;

    @Column({ name: 'auction_id', type: 'uuid', nullable: true })
    auctionId?: Uuid;

    @ManyToOne(() => AuctionEntity)
    @JoinColumn({ name: 'auction_id' })
    auction?: AuctionEntity;
}
