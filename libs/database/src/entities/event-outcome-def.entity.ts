import { Column, Entity, PrimaryColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

/**
 * RFC 0002 — Event outcome dictionary. One row per (outcome_id).
 * Like EventClassDef, the id is a **stable SMALLINT** (D3).
 *
 * The `match_event.outcome_code` column is denormalized from
 * `event_outcome_def.code` so the FE can read the code without
 * joining. This entity is the source of truth for the
 * denormalized values; backfill + Phase 2 engine writes must
 * keep them in sync.
 *
 * See `docs/rfcs/0002-event-two-axis.md` for the design.
 */
@Entity('event_outcome_def')
export class EventOutcomeDefEntity extends AbstractEntity {
    /** Stable SMALLINT PK. 1-28 currently used; 29-100 reserved. */
    @PrimaryColumn({ type: 'smallint' })
    id!: number;

    /** Stable upper-snake code: 'GOAL' 'SAVE' 'BLOCKED' etc. Unique. */
    @Column({ type: 'varchar', length: 32, unique: true })
    code!: string;

    /**
     * "对我方有利" filter flag. Powers the FE's "positive
     * events only" view (e.g. a GK-detail page shows the
     * keeper's saves but not the goals they conceded).
     */
    @Column({ name: 'is_positive', type: 'boolean' })
    isPositive!: boolean;

    /**
     * Whether this outcome counts in season-long stats. Most
     * are countable (goals, saves, cards). A few admin /
     * start-end outcomes are not (warning, start, end, etc.).
     */
    @Column({ name: 'is_countable', type: 'boolean' })
    isCountable!: boolean;

    /** Stable rendering order in FE lists. */
    @Column({ name: 'sort_order', type: 'smallint' })
    sortOrder!: number;

    /**
     * D5 — i18n copy. Shape: `{ "zh": "...", "en": "...", ... }`.
     * Same rules as EventClassDef.description.
     */
    @Column({ type: 'jsonb' })
    description!: Record<string, string>;

    constructor(data?: Partial<EventOutcomeDefEntity>) {
        super();
        Object.assign(this, data);
    }
}
