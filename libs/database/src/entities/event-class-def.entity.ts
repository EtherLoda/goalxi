import { Column, Entity, PrimaryColumn } from 'typeorm';
import { AbstractEntity } from './abstract.entity';

/**
 * RFC 0002 — Event class dictionary. One row per (class_id).
 * The id is a **stable SMALLINT** (D3: hand-assigned, not SERIAL)
 * so dev / staging / prod use the same ids — important for
 * FE that holds hardcoded maps from id → display label.
 *
 * See `docs/rfcs/0002-event-two-axis.md` for the design.
 * See migration `1788000000001-CreateEventClassOutcomeDefs.ts`
 * for the seed data.
 */
@Entity('event_class_def')
export class EventClassDefEntity extends AbstractEntity {
    /** Stable SMALLINT PK. 1-17 currently used; 18-100 reserved. */
    @PrimaryColumn({ type: 'smallint' })
    id!: number;

    /** Stable lower-snake code: 'SHOT' 'FOUL' 'GOAL' etc. Unique. */
    @Column({ type: 'varchar', length: 32, unique: true })
    code!: string;

    /**
     * Family bucket for FE filtering / color:
     *   'positive' — goals, saves, good things for the team
     *   'negative' — fouls, injuries, missed chances
     *   'neutral'  — passes, possession changes
     *   'period'   — start / end of half, full-time
     */
    @Column({ type: 'varchar', length: 16 })
    family!: 'positive' | 'negative' | 'neutral' | 'period';

    /**
     * D4 — Allowed outcome ids for this class. Stored as
     * SMALLINT[] (PG array). `{}` when the class has no
     * outcome (e.g. KICKOFF, OWN_GOAL). Phase 2 readers
     * should validate `outcome_id ∈ class.outcomes` if
     * they need strictness.
     */
    @Column({ type: 'smallint', array: true, default: '{}' })
    outcomes!: number[];

    /**
     * Whether the FE surfaces this class in the live feed.
     * `false` for SNAPSHOT (raw engine debug) and any future
     * internal class. Stats queries still include the row
     * — only the UI filters it out.
     */
    @Column({ name: 'is_visible', type: 'boolean', default: true })
    isVisible!: boolean;

    /** Stable rendering order in FE lists. */
    @Column({ name: 'sort_order', type: 'smallint' })
    sortOrder!: number;

    /**
     * D5 — i18n copy. Shape: `{ "zh": "...", "en": "...", ... }`.
     * The FE picks the active locale's entry. Fallback to `en`
     * when the active locale is missing. The DB does NOT
     * validate the shape — that's a FE concern.
     */
    @Column({ type: 'jsonb' })
    description!: Record<string, string>;

    constructor(data?: Partial<EventClassDefEntity>) {
        super();
        Object.assign(this, data);
    }
}
