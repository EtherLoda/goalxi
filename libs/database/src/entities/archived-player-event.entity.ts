import { Uuid } from '../types/common.type';
import { AbstractEntity } from './abstract.entity';
import { PlayerEntity } from './player.entity';
import { MatchEntity } from './match.entity';
import { PlayerEventType } from './player-event.entity';
import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity('archived_player_event')
@Index(['playerId', 'season'])
@Index(['playerId', 'eventType'])
@Index(['season', 'eventType'])
export class ArchivedPlayerEventEntity extends AbstractEntity {
    @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_archived_player_event_id' })
    id!: Uuid;

    @Column({ name: 'player_id', type: 'uuid' })
    playerId!: Uuid;

    @ManyToOne(() => PlayerEntity, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ type: 'int' })
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

    @Column({ name: 'archived_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
    archivedAt!: Date;
}
