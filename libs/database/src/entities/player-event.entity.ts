import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { PlayerEntity } from './player.entity';
import { MatchEntity } from './match.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Index } from 'typeorm';

export enum PlayerEventType {
    // Transfer & Contract
    TRANSFER = 'TRANSFER',
    CONTRACT_RENEWAL = 'CONTRACT_RENEWAL',

    // Youth & Debut
    YOUTH_PROMOTION = 'YOUTH_PROMOTION',
    DEBUT = 'DEBUT',
    LEAGUE_DEBUT = 'LEAGUE_DEBUT',
    CAPTAIN_DEBUT = 'CAPTAIN_DEBUT',

    // Match Events
    HAT_TRICK = 'HAT_TRICK',
    MAN_OF_THE_MATCH = 'MAN_OF_THE_MATCH',

    // Season Awards
    GOLDEN_BOOT = 'GOLDEN_BOOT',
    ASSISTS_LEADER = 'ASSISTS_LEADER',
    TACKLES_LEADER = 'TACKLES_LEADER',
    CHAMPIONSHIP_TITLE = 'CHAMPIONSHIP_TITLE',

    // Other
    INJURY = 'INJURY',
    RECORD_BROKEN = 'RECORD_BROKEN',
}

@Entity('player_event')
@Index(['playerId', 'season'])
@Index(['playerId', 'eventType'])
export class PlayerEventEntity extends AbstractEntity {
    constructor(data?: Partial<PlayerEventEntity>) {
        super();
        Object.assign(this, data);
    }

    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_player_event_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ type: 'integer' })
    season!: number;

    @Column({ type: 'timestamptz' })
    date!: Date;

    @Column({ name: 'event_type', type: 'varchar', length: 50, enum: PlayerEventType })
    eventType!: PlayerEventType;

    @Column({ type: 'varchar', length: 100, nullable: true })
    icon?: string;

    @Column({ name: 'title_key', type: 'varchar', length: 255, nullable: true })
    titleKey?: string;

    @Column({ name: 'match_id', type: 'uuid', nullable: true })
    matchId?: Uuid;

    @ManyToOne(() => MatchEntity, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'match_id' })
    match?: MatchEntity;

    @Column({ name: 'title_data', type: 'jsonb', nullable: true })
    titleData?: Record<string, any>;

    @Column({ type: 'jsonb', nullable: true })
    details?: any;
}
