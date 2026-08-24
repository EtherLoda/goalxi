// JSONB data field types for match events.
// Each event type has its own strongly-typed data payload.

export interface Position {
    x: number;
    y: number;
}

export interface ShotEventData {
    shotType: 'normal' | 'header' | 'long_shot' | 'one_on_one' | 'penalty' | 'free_kick' | 'rebounded';
    bodyPart: 'head' | 'left_foot' | 'right_foot' | 'other';
    position: Position;
    quality: number;
    gkRating: number;
    wasBlocked: boolean;
    blockPlayerId?: number;
    isOneOnOne: boolean;
}

export interface GoalEventData extends ShotEventData {
    goalFrom: 'close_range' | 'long_range';
    defendingRating: number;
    shotNumber: number;
}

export interface CardEventData {
    cardType: 'yellow' | 'second_yellow' | 'red';
    reason: string;
    foulMinute?: number;
}

export interface SubstitutionEventData {
    position: string;
    formation: string;
    tacticalReason: 'attacking' | 'defensive' | 'injury' | 'tired' | 'tactical';
    substitutePlayerId: number;
}

export interface InjuryEventData {
    injuryType: string;
    bodyPart: string;
    /**
     * Post-2026-08-06 collapse: only `mild` | `severe` exist. The old
     * `moderate` string maps to `severe` for legacy event payloads
     * (see migration 1729000000000-MergeInjurySeverity for the DB-side
     * remap of historical severity=3 rows).
     */
    severity: 'mild' | 'severe';
    treatmentSeconds: number;
    missedGames: number;
    recoveryDays: number;
}

export interface PenaltyEventData {
    outcome: 'goal' | 'miss' | 'saved';
    shotType: 'normal' | 'long_shot' | 'one_on_one';
    penaltyTakerId: string;
    gkId: string;
    gkRating: number;
    quality: number;
}

export interface SetPieceEventData {
    delivery: 'short' | 'long' | 'inswinging' | 'outswinging';
    outcome: 'goal' | 'shot' | 'clearance' | 'possession';
}

export interface PeriodEventData {
    homeTeam: string;
    awayTeam: string;
    period: string;
}

export interface ForfeitEventData {
    forfeitingTeam: string;
    winner: string;
}

export interface LineupEventData {
    players: Array<{
        playerId: number;
        playerName: string;
        position: string;
        number: number;
    }>;
}

export interface VarEventData {
    decision: 'goal' | 'no_goal' | 'penalty' | 'red_card' | 'cancellation';
    reason: string;
    originalMinute: number;
}

/**
 * Per-snapshot lane strengths (mirrors `simulator/.../match.engine.ts:2632`
 * `formatLanes`). Each lane carries the team's current strength in three
 * dimensions — `atk` for attacking push power, `def` for defending against
 * push, `pos` for midfield control. Decimals to one place: the simulator
 * rounds with `toFixed(1)` before emitting.
 */
export interface SnapshotLaneStrengths {
    left: { atk: number; def: number; pos: number };
    center: { atk: number; def: number; pos: number };
    right: { atk: number; def: number; pos: number };
}

/**
 * Per-snapshot lane counters (mirrors `simulator/.../match.engine.ts`
 * `formatCounters`). Four numbers per lane:
 *   - `att`  — running total of attacks attempted in this lane (debug).
 *   - `ps_`  — running total of push duels actually won (debug).
 *   - `pr`   — engine-computed expected push success probability (0..1),
 *              the mean of `duelProbability(attPower, defPower)` across
 *              every push duel in this lane. The FE's Push Success Rate
 *              panel reads this directly — no client-side division, so
 *              the rate is stable across small samples.
 *   - `mpr`  — engine-computed expected midfield win probability (0..1),
 *              the mean of `duelProbability(homeControl, awayControl)`
 *              across every midfield battle in this lane. The FE's
 *              Possession Share panel uses both sides' `mpr` (home /
 *              (home + away)) to render the share.
 */
export interface SnapshotLaneCounters {
    left: { att: number; ps_: number; pr: number; mpr: number };
    center: { att: number; ps_: number; pr: number; mpr: number };
    right: { att: number; ps_: number; pr: number; mpr: number };
}

/**
 * Snapshot event payload — emitted by the simulator every ~5 minutes.
 * Carries lane strengths (for ATK/DEF/POSS bars), lane counters (for
 * PUSH SUCCESS RATE), the GK rating for that snapshot, and a per-player
 * state array (stamina, star rating, entry minute) used by the match
 * page pitch markers.
 *
 * `n` (team name) is set on the t=0 snapshot only — subsequent snapshots
 * rely on the match metadata (homeTeam/awayTeam) for the names.
 */
export interface SnapshotEventData {
    h: {
        n?: string;
        ls: SnapshotLaneStrengths;
        lc: SnapshotLaneCounters;
        gk: number;
        ps: Array<{
            id: string;
            p: string;
            n?: string;
            st: number;
            sr: number;
            em: number;
        }>;
    };
    a: {
        n?: string;
        ls: SnapshotLaneStrengths;
        lc: SnapshotLaneCounters;
        gk: number;
        ps: Array<{
            id: string;
            p: string;
            n?: string;
            st: number;
            sr: number;
            em: number;
        }>;
    };
}

export type MatchEventData =
    | GoalEventData
    | ShotEventData
    | CardEventData
    | SubstitutionEventData
    | InjuryEventData
    | PenaltyEventData
    | SetPieceEventData
    | PeriodEventData
    | ForfeitEventData
    | LineupEventData
    | VarEventData
    | Record<string, never>;

/**
 * Per-event specialty contribution record. One row in the JSONB
 * `specialty_contributions` array on `match_event` for every
 * specialty that actually moved the multiplier (i.e. ≠ 1.0) during
 * this event's resolution.
 *
 * RFC 0003 — see `docs/rfcs/0003-specialty-attribution.md`. The
 * 23 leaf multipliers in `simulator/.../systems/specialty.system.ts`
 * are the only writers; everything else is a read.
 *
 * `effectKey` is the canonical `SpecialtyEvent` string
 * ('shot_header' | 'gk_save' | ...). The FE uses it to know which
 * hook fired (e.g. to render "Aerial Threat +14% on header shots"
 * rather than just "+14%").
 *
 * `role` is the player's role in this specific event
 * ('shooter' for the person who took the shot, 'gk' for the keeper
 * who saved, etc.). Distinct from `effectKey` because one player
 * can have multiple effects (a SHOOTER might fire `shot_header`
 * AND `shot_one_on_one` on the same play).
 *
 * `isPrimary` is true for at most one entry per event — the
 * person who triggered the event's headline outcome
 * (D8="triggering person is primary"). Engine-side guarantee:
 * exactly 0 or 1 primary per event.
 *
 * `multiplier` is the tier-scaled final value (1.143 for Gold
 * 1.10, 0.85 for Silver 0.80, etc.). **Player-facing FE must
 * never display the raw decimal** (D9) — use the
 * `formatSpecialtyBonus` helper in `web/src/lib/specialty-bonus.ts`
 * to render "+14% 效果" / "+14% boost" instead.
 */
export interface SpecialtyContribution {
    playerId: number;
    /** `ActiveCoreSpecialty` string, e.g. 'AERIAL_THREAT' | 'DRIBBLER'. */
    specialtyCode: string;
    /** 'GOLD' | 'SILVER' | 'BRONZE' */
    tier: 'GOLD' | 'SILVER' | 'BRONZE';
    /** `SpecialtyEvent` key — the leaf hook that fired. */
    effectKey: string;
    /**
     * Tier-scaled final multiplier. ALWAYS > 0. Stored as a
     * number in JSONB; values typically 0.5..1.5. Never displayed
     * to players.
     */
    multiplier: number;
    /**
     * The player's role in this event. Distinct from `effectKey`
     * because one player can hold multiple roles/hooks in a single
     * event (rare but possible — e.g. a SAVING_MASTER GK whose
     * SWEEPER_KEEPER aura also fired on the same play).
     */
    role:
        | 'shooter'
        | 'assister'
        | 'gk'
        | 'defender'
        | 'tackler'
        | 'fouled'
        | 'fouler'
        | 'attacker'
        | 'midfielder'
        | 'attacker_lane'
        | 'defender_lane'
        | 'generic';
    /** Engine guarantee: ≤1 primary per event. */
    isPrimary: boolean;
}
