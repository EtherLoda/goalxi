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
import { YouthMatchEntity } from './youth-match.entity';
import { YouthTeamEntity } from './youth-team.entity';
import { YouthPlayerEntity } from './youth-player.entity';
import { MatchEventType, MatchPhase, MatchLane } from '../constants/event-types';
import { MatchEventData } from '../types/match-event-data';

@Entity('youth_match_event')
@Index(['youthMatchId', 'phase', 'minute'])
@Index(['youthMatchId', 'eventScheduledTime'])
@Index(['playerId', 'type'])
export class YouthMatchEventEntity extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ name: 'youth_match_id', type: 'uuid' })
    youthMatchId!: string;

    @ManyToOne(() => YouthMatchEntity)
    @JoinColumn({ name: 'youth_match_id' })
    youthMatch?: YouthMatchEntity;

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

    @ManyToOne(() => YouthTeamEntity)
    @JoinColumn({ name: 'team_id' })
    team?: YouthTeamEntity;

    @Column({ name: 'player_id', type: 'uuid', nullable: true })
    playerId?: string;

    @ManyToOne(() => YouthPlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: YouthPlayerEntity;

    @Column({ name: 'related_player_id', type: 'uuid', nullable: true })
    relatedPlayerId?: string;

    @ManyToOne(() => YouthPlayerEntity)
    @JoinColumn({ name: 'related_player_id' })
    relatedPlayer?: YouthPlayerEntity;

    @Column({ type: 'varchar', length: 16, enum: MatchPhase, default: MatchPhase.FIRST_HALF })
    phase!: MatchPhase;

    @Column({ type: 'varchar', length: 8, enum: MatchLane, nullable: true })
    lane?: MatchLane;

    @Column({ type: 'boolean', nullable: true })
    isHome?: boolean;

    @Column({ type: 'jsonb', nullable: true })
    data?: MatchEventData;

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

    constructor(partial?: Partial<YouthMatchEventEntity>) {
        super();
        Object.assign(this, partial);
    }
}
