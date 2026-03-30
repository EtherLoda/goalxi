import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { MatchEntity } from './match.entity';
import { TeamEntity } from './team.entity';
import { PlayerEntity } from './player.entity';
import { MatchEventType, MatchPhase, MatchLane } from '../constants/event-types';
import { MatchEventData } from '../types/match-event-data';

@Entity('match_event')
@Index(['matchId', 'phase', 'minute'])
@Index(['matchId', 'eventScheduledTime'])
@Index(['playerId', 'type'])
export class MatchEventEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'match_id', type: 'uuid' })
    matchId!: string;

    @ManyToOne(() => MatchEntity)
    @JoinColumn({ name: 'match_id' })
    match?: MatchEntity;

    @Column({ type: 'int' })
    minute!: number;

    @Column({ type: 'int', default: 0 })
    second!: number;

    @Column({ type: 'int', enum: MatchEventType })
    type!: MatchEventType;

    @Column({ type: 'varchar', length: 100, name: 'type_name' })
    typeName!: string;

    @Column({ name: 'team_id', type: 'uuid', nullable: true })
    teamId?: string;

    @ManyToOne(() => TeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: TeamEntity;

    @Column({ name: 'player_id', type: 'uuid', nullable: true })
    playerId?: string;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'related_player_id', type: 'uuid', nullable: true })
    relatedPlayerId?: string;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'related_player_id' })
    relatedPlayer?: PlayerEntity;

    // New fixed columns
    @Column({ type: 'varchar', length: 16, enum: MatchPhase, default: MatchPhase.FIRST_HALF })
    phase!: MatchPhase;

    @Column({ type: 'varchar', length: 8, enum: MatchLane, nullable: true })
    lane?: MatchLane;

    @Column({ type: 'boolean', nullable: true })
    isHome?: boolean;

    @Column({ type: 'jsonb', nullable: true })
    data?: MatchEventData;

    // Generated Columns — read-only in application, PostgreSQL auto-maintains
    // These columns are derived from the JSONB data field and enable indexed queries
    @Column({ type: 'varchar', length: 32, nullable: true, select: false })
    shotType?: string;

    @Column({ type: 'varchar', length: 16, nullable: true, select: false })
    bodyPart?: string;

    @Column({ type: 'varchar', length: 16, nullable: true, select: false })
    cardType?: string;

    @Column({ type: 'varchar', length: 16, nullable: true, select: false })
    injurySeverity?: string;

    @Column({ type: 'varchar', length: 16, nullable: true, select: false })
    subPosition?: string;

    @Column({ type: 'varchar', length: 16, nullable: true, select: false })
    penaltyOutcome?: string;

    @Column({ name: 'event_scheduled_time', type: 'timestamp', nullable: true })
    eventScheduledTime?: Date;

    @Column({ name: 'is_revealed', type: 'boolean', default: false })
    isRevealed!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    constructor(partial?: Partial<MatchEventEntity>) {
        super();
        Object.assign(this, partial);
    }
}
