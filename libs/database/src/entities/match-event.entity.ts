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
import { MatchEventData, SpecialtyContribution } from '../types/match-event-data';

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

    @Column({ name: 'player_id', type: 'int', nullable: true })
    playerId?: number;

    @ManyToOne(() => PlayerEntity)
    @JoinColumn({ name: 'player_id' })
    player?: PlayerEntity;

    @Column({ name: 'related_player_id', type: 'int', nullable: true })
    relatedPlayerId?: number;

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

    /**
     * RFC 0003 — Specialty Attribution. JSONB array of contributions
     * (one per specialty that fired on this event). See
     * `docs/rfcs/0003-specialty-attribution.md` and
     * `SpecialtyContribution` in `types/match-event-data.ts`.
     *
     * The column is nullable: the 99% case is "no specialty affected
     * this event" and storing `'[]'` vs NULL has no semantic value,
     * so we save the bytes and use NULL. The partial indexes on
     * `primary_specialty_code` and the GIN index on this column
     * both `WHERE NOT NULL` so they don't include the no-effect rows.
     *
     * Engine-side: only the 23 leaf multipliers in
     * `simulator/.../systems/specialty.system.ts` write to this
     * column, via the `SpecialtyAttributionRecorder` helper. The
     * engine orders the array so index 0 is always the primary
     * contributor (D8) — that's why the generated columns below
     * use `->0`.
     */
    @Column({ type: 'jsonb', nullable: true, name: 'specialty_contributions' })
    specialtyContributions?: SpecialtyContribution[];

    /**
     * RFC 0003 — generated column, derived from
     * `specialty_contributions->0->>'specialtyCode'`. Indexed
     * (partial) to answer "events where a specialty fired" without
     * JSONB parsing. STORED (not VIRTUAL) because PG disallows
     * indexing on VIRTUAL generated columns.
     */
    @Column({ type: 'varchar', length: 32, nullable: true, select: false })
    primarySpecialtyCode?: string | null;

    /**
     * RFC 0003 — generated column, derived from
     * `specialty_contributions->0->>'tier'`. Not indexed alone
     * (the FE always queries with the code). STORED so the FE can
     * render "Gold 空霸" without re-parsing JSONB.
     */
    @Column({ type: 'varchar', length: 8, nullable: true, select: false })
    primarySpecialtyTier?: string | null;

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
