/**
 * RFC 0002 — Event two-axis typeName → (classId, outcomeId) mapping.
 *
 * The engine emits events with a lowercase_snake `type` string
 * (e.g. `'goal'`, `'yellow_card'`, `'half_time'`). The simulator's
 * `simulation.processor.ts` translates that string into:
 *
 *   - the legacy `type` int (via the `MatchEventType` enum, kept
 *     for the Phase 1/2 soak period)
 *   - the new (classId, outcomeId, outcomeCode) tuple for the
 *     RFC 0002 two-axis schema
 *
 * The DB-side mirror of this map is the
 * `match_event_backfill_class_outcome` SQL function (see migration
 * `1788000000001-CreateEventClassOutcomeDefs.ts`). The two MUST
 * stay in sync — a unit spec
 * (`libs/database/src/constants/event-two-axis.spec.ts`) pins
 * the exact ids.
 *
 * ## Why a TS mirror, not a DB query
 *
 * The processor runs in a hot path (a 90-min match produces
 * ~150-300 events, all bulk-inserted in one transaction). One
 * SQL query per event would tank throughput. The TS map is
 * O(1) per lookup and the spec pins the contract.
 *
 * ## Convention
 *
 *   `outcomeId: null` and `outcomeCode: null` mean "this class
 *   has no outcome" (KICKOFF, OWN_GOAL, etc.) OR "the outcome
 *   lives in the row's `data` JSONB" (INJURY uses
 *   `data.injuryData.severity`, SUBSTITUTION uses
 *   `data.tacticalReason`, etc.). The Phase 3 cleanup will
 *   move those into proper outcome ids.
 *
 *   A missing key (e.g. a future event type) returns
 *   `{ classId: null, outcomeId: null, outcomeCode: null }`
 *   — the `type` int will fall back to `NEUTRAL_EVENT=27`
 *   in the existing `mapEventType` path, and the new
 *   columns are simply NULL on the row.
 *
 * ## Dead enum caveat
 *
 * The following MatchEventType enum values are **not emitted by
 * the live engine** and have no mapping here:
 *
 *   5=PASS, 6=TACKLE, 7=INTERCEPTION, 28=CLEARANCE, 16=OFFSIDE,
 *   27=NEUTRAL_EVENT, 26=CELEBRATION, 29=OWN_GOAL, 30=VAR_DECISION
 *
 * They exist in the enum as legacy but no live path produces
 * them. See RFC 0002 §4.2 "Note on dead enum entries" for the
 * Phase 3 cleanup.
 */

/** Stable id into `event_class_def` (1-17 used, 18-100 reserved). */
export type EventClassId = number;

/** Stable id into `event_outcome_def` (1-28 used, 29-100 reserved). */
export type EventOutcomeId = number;

export interface EventTwoAxis {
    classId: EventClassId | null;
    outcomeId: EventOutcomeId | null;
    /**
     * Denormalized stable string from `event_outcome_def.code`.
     * Same as `event_outcome_def[outcomeId].code` when
     * `outcomeId !== null`. `null` when `outcomeId` is null.
     */
    outcomeCode: string | null;
}

/**
 * Authoritative typeName → (classId, outcomeId, outcomeCode) map.
 * Keys MUST match the strings the engine emits in `events.push`.
 * (Verified by grep `type: '...'` across match.engine.ts and
 * event.generator.ts.)
 */
export const EVENT_TWO_AXIS: Readonly<Record<string, EventTwoAxis>> = Object.freeze({
    // ============== Period / meta ==============
    kickoff:                 { classId:  1, outcomeId: null, outcomeCode: null },  // KICKOFF
    half_time:               { classId:  2, outcomeId: 27,   outcomeCode: 'END' },
    second_half:             { classId:  2, outcomeId: 26,   outcomeCode: 'START' },
    full_time:               { classId:  2, outcomeId: 27,   outcomeCode: 'END' },
    forfeit:                 { classId: 16, outcomeId: 28,   outcomeCode: 'FORFEIT' },

    // ============== Shot / goal / save ==============
    // SHOT is the umbrella class (3). Outcome distinguishes
    // goal / save / miss. SHOT_ON_TARGET is intentionally
    // class=SHOT, outcome=null — the engine can't decide
    // goal vs save without running the duel, and at this
    // point in the pipeline the outcome isn't known.
    goal:                    { classId:  3, outcomeId:  1, outcomeCode: 'GOAL' },
    shot_on_target:          { classId:  3, outcomeId: null, outcomeCode: null },
    shot_off_target:         { classId:  3, outcomeId:  4, outcomeCode: 'MISS' },
    save:                    { classId:  3, outcomeId:  2, outcomeCode: 'SAVE' },
    turnover:                { classId:  3, outcomeId:  4, outcomeCode: 'MISS' },  // 'turnover' = failed attack push (int=5 PASS)

    // ============== Foul / card ==============
    // D2: FOUL class covers all card events. The outcome
    // distinguishes the severity.
    foul:                    { classId:  4, outcomeId:  5, outcomeCode: 'WARNING' },
    yellow_card:             { classId:  4, outcomeId:  6, outcomeCode: 'YELLOW' },
    red_card:                { classId:  4, outcomeId:  8, outcomeCode: 'RED' },

    // ============== Set pieces ==============
    corner:                  { classId:  6, outcomeId: 11,   outcomeCode: 'TAKEN' },
    free_kick:               { classId:  5, outcomeId: 11,   outcomeCode: 'TAKEN' },
    penalty_goal:            { classId:  7, outcomeId:  1,   outcomeCode: 'GOAL' },
    penalty_miss:            { classId:  7, outcomeId:  4,   outcomeCode: 'MISS' },

    // ============== Substitution / injury ==============
    // Both have outcome in data JSONB (tacticalReason /
    // severity) — the engine emits these as class-only.
    // The four generated columns (shot/foul/corner/fk_outcome)
    // stay NULL for these rows; readers fall back to data.
    substitution:            { classId:  8, outcomeId: 14,   outcomeCode: 'TACTICAL' },
    injury:                  { classId:  9, outcomeId: null, outcomeCode: null },

    // ============== Lifecycle / neutral ==============
    snapshot:                { classId: 17, outcomeId: null, outcomeCode: null },
    weather_announcement:    { classId: 14, outcomeId: null, outcomeCode: null },
    player_introduction:     { classId: 13, outcomeId: null, outcomeCode: null },  // home/away in data
    attendance_announcement: { classId: 15, outcomeId: null, outcomeCode: null },
});

/**
 * Look up the two-axis tuple for a given event `type` string.
 * Returns the null tuple for unknown strings (defensive —
 * the engine should never produce an unknown type, but
 * the existing `mapEventType` falls back to NEUTRAL_EVENT
 * for unknown strings and we mirror that behavior).
 */
export function getEventTwoAxis(typeName: string | null | undefined): EventTwoAxis {
    if (typeName == null) {
        return { classId: null, outcomeId: null, outcomeCode: null };
    }
    return (
        EVENT_TWO_AXIS[typeName] ?? {
            classId: null,
            outcomeId: null,
            outcomeCode: null,
        }
    );
}
