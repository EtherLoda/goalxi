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
// RFC 0002 Phase 3 — `MatchEventType` (the legacy int enum)
// is no longer used as a DB column (it was the source of
// the dropped `type` int). The enum constant still exists
// in `event-types.ts` for backwards-compat with any
// straggler test code, but no production code references
// it anymore.
import { MatchPhase, MatchLane } from '../constants/event-types';
import { MatchEventData, SpecialtyContribution } from '../types/match-event-data';

@Entity('match_event')
@Index(['matchId', 'phase', 'minute'])
@Index(['matchId', 'eventScheduledTime'])
@Index(['playerId', 'eventClassId'])
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

    // RFC 0002 Phase 3 — the legacy `type` int column is
    // DROPPED. The `typeName` string STAYS — it is the
    // wire format the FE relies on (commentary templates,
    // EVENT_COLOR / EVENT_ICON lookups, timeline, 8+ other
    // call sites — see `web/src/components/match/`). The
    // wire string is context-sensitive (PERIOD+END can be
    // 'half_time' or 'full_time'; SHOT+MISS can be 'miss'
    // or 'turnover') and can't be reconstructed from the
    // tuple. Phase 3 keeps the string column as the
    // 1:1 mirror of the engine's `e.type` field.
    //
    // The two-axis tuple below is the *authoritative*
    // source for stats queries; `typeName` is the wire
    // format. Both are written together by the engine's
    // processor; both come from the engine's `e.type`
    // string. They MUST stay in sync.
    @Column({ type: 'varchar', length: 64, name: 'type_name' })
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
     *
     * The `name:` override is load-bearing: TypeORM's
     * `DefaultNamingStrategy.columnName()` does NOT do camelCase →
     * snake_case conversion (it returns the property name as-is).
     * Without this override, TypeORM generates SQL referencing
     * `"primarySpecialtyCode"` (camelCase, double-quoted) which
     * doesn't exist — the actual column is the snake_case
     * `primary_specialty_code` created by migration
     * `1788000000000-AddMatchEventSpecialtyContributions`.
     * The simulator bulk-insert path (`createQueryBuilder().insert()
     * .into(MatchEventEntity)`) tripped this once it started
     * reaching for the entity metadata to build the column list.
     */
    @Column({
      name: 'primary_specialty_code',
      type: 'varchar',
      length: 32,
      nullable: true,
      select: false,
    })
    primarySpecialtyCode?: string | null;

    /**
     * RFC 0003 — generated column, derived from
     * `specialty_contributions->0->>'tier'`. Not indexed alone
     * (the FE always queries with the code). STORED so the FE can
     * render "Gold 空霸" without re-parsing JSONB.
     *
     * `name:` override for the same reason as
     * `primarySpecialtyCode` above — TypeORM's
     * `DefaultNamingStrategy` doesn't snake_case the property
     * name, and the migration created the column as
     * `primary_specialty_tier`.
     */
    @Column({
      name: 'primary_specialty_tier',
      type: 'varchar',
      length: 8,
      nullable: true,
      select: false,
    })
    primarySpecialtyTier?: string | null;

    // =============================================================
    // RFC 0002 — Two-Axis Event Coding (Phase 3: NOT NULL enforced)
    // =============================================================
    // See `docs/rfcs/0002-event-two-axis.md`. The legacy `type`
    // int column is DROPPED. The new (eventClassId, outcomeId,
    // outcomeCode) tuple is the single source of truth for
    // classification.
    //
    // `event_class_id` is NOT NULL. The Phase 3 migration
    // (1788000000002-DropMatchEventLegacyColumns) ran a pre-check
    // on existing rows and a SET NOT NULL. The TS entity is
    // updated to match — `nullable: false` here so any future
    // TypeORM contributor sees the constraint in code, and the
    // simulator's bulk-insert pre-flight (see
    // simulation.processor.ts) fails fast with a clear error
    // if a new engine emit lands without an EVENT_TWO_AXIS row
    // (the 2026-08-26 production incident on a
    // `recover-${matchId}-${bucket}` job).
    //
    // `outcome_id` and `outcome_code` STAY nullable. Some
    // classes are outcome-less by design (KICKOFF, OWN_GOAL,
    // CELEBRATION, WEATHER, ATTENDANCE, SNAPSHOT), and a few
    // others (INJURY, SUBSTITUTION) store their outcome in
    // the `data` JSONB column.

    /**
     * Stable SMALLINT id into `event_class_def`. NOT NULL —
     * every match_event row has exactly one class. See the
     * block comment above for the migration / tripwire story.
     */
    @Column({ name: 'event_class_id', type: 'smallint', nullable: false })
    eventClassId!: number;

    /**
     * Stable SMALLINT id into `event_outcome_def`. NULL when
     * the class has no outcome (KICKOFF, OWN_GOAL, etc.) or
     * when the backfill couldn't determine the outcome from
     * the legacy `type` alone (e.g. SHOT_ON_TARGET is
     * ambiguous — was it a goal or a save?).
     */
    @Column({ name: 'outcome_id', type: 'smallint', nullable: true })
    outcomeId?: number | null;

    /**
     * Denormalized stable string from `event_outcome_def.code`.
     * Same value as `event_outcome_def[outcomeId].code`. Kept
     * inline so the FE doesn't need a join to render
     * "GOAL" / "SAVE" / etc.
     */
    @Column({ name: 'outcome_code', type: 'varchar', length: 32, nullable: true })
    outcomeCode?: string | null;

    // RFC 0002 — 4 generated outcome columns. D2 = FOUL merges
    // CARD, so the 4 wide-format columns cover SHOT, FOUL,
    // CORNER, FREE_KICK. Other classes fall through to NULL.
    // These are STORED (not VIRTUAL) for consistency with the
    // RFC 0003 generated columns and to leave room for a
    // future index without a re-migration.
    //
    // Each column mirrors the generated-column shape declared
    // in migration 1788000000001; keep the CASE expression in
    // sync. (TypeORM doesn't auto-generate them — the SQL
    // migration owns the truth.)

    /** Outcome code when event_class_id = SHOT (3). NULL otherwise. */
    @Column({ name: 'shot_outcome', type: 'varchar', length: 16, nullable: true, select: false })
    shotOutcome?: string | null;

    /** Outcome code when event_class_id = FOUL (4). NULL otherwise. */
    @Column({ name: 'foul_outcome', type: 'varchar', length: 16, nullable: true, select: false })
    foulOutcome?: string | null;

    /** Outcome code when event_class_id = CORNER (6). NULL otherwise. */
    @Column({ name: 'corner_outcome', type: 'varchar', length: 16, nullable: true, select: false })
    cornerOutcome?: string | null;

    /** Outcome code when event_class_id = FREE_KICK (5). NULL otherwise. */
    @Column({ name: 'free_kick_outcome', type: 'varchar', length: 16, nullable: true, select: false })
    freeKickOutcome?: string | null;

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
