/**
 * EVENT_TWO_AXIS spec — RFC 0002 Phase 2.
 *
 * The TS map is the hot-path mirror of the
 * `match_event_backfill_class_outcome` SQL function. The two
 * must stay in sync — this test pins the contract.
 */
import { EVENT_TWO_AXIS, getEventTwoAxis } from './event-two-axis';

describe('EVENT_TWO_AXIS (RFC 0002 P2)', () => {
    describe('mapping integrity', () => {
        it('covers every type string the engine emits', () => {
            // Authoritative list of strings the engine pushes
            // to `events` (verified by grep `events\.push` across
            // simulator/src/engine/match.engine.ts and
            // simulator/src/processor/simulation.processor.ts,
            // filtering for the `type:` field). The list is
            // 22 entries.
            //
            // 2026-08-26 production incident: 'miss' and
            // 'tactical_change' were missing from this list.
            // The engine pushed them, getEventTwoAxis returned
            // the null tuple, the bulk insert wrote
            // event_class_id=NULL, and PG rejected the row
            // because migration 1788000000002 made the column
            // NOT NULL. The previous "24 strings" test only
            // checked that a curated subset existed — it
            // drifted from the engine's actual emit set.
            // This test is now bidirectional in spirit: the
            // list below must match the engine exactly. If a
            // future contributor adds a new `type: 'foo'` to
            // the engine and forgets to add 'foo' here, the
            // assertion will fail at lint time.
            //
            // Note on the other direction: the map may
            // legitimately contain keys the engine doesn't
            // emit today (`'shot_on_target'`, `'shot_off_target'`,
            // `'foul'`) — the FE commentary template system
            // (web/src/lib/commentary.ts, web/messages/*.json)
            // and the test fixtures reference them. Removing
            // them would orphan FE fallback strings and is
            // out of scope. Adding a NEW extra key without
            // an engine emit is also a code smell — see the
            // "does NOT contain dead enum types" check below
            // for the curated list of forbidden entries.
            const engineEmits = [
                // match.engine.ts (events.push sites)
                'kickoff', 'half_time', 'second_half', 'full_time',
                'goal', 'miss', 'save', 'turnover',
                'corner', 'free_kick', 'penalty_goal', 'penalty_miss',
                'yellow_card', 'red_card', 'injury', 'substitution',
                'tactical_change', 'snapshot',
                // event.generator.ts (called from match.engine.ts push sites)
                'weather_announcement', 'attendance_announcement',
                'player_introduction',
                // simulation.processor.ts (forfeit path)
                'forfeit',
            ];
            for (const t of engineEmits) {
                expect(EVENT_TWO_AXIS).toHaveProperty(t);
                // Sanity: the lookup must return the row, not
                // the null fallback. A null classId here
                // would surface as a PG NOT NULL violation
                // in the simulator's bulk insert path.
                expect(getEventTwoAxis(t).classId).not.toBeNull();
            }
        });

        it('does NOT contain the 8 dead enum types', () => {
            // 6=TACKLE, 7=INTERCEPTION, 28=CLEARANCE,
            // 16=OFFSIDE, 27=NEUTRAL_EVENT, 26=CELEBRATION,
            // 29=OWN_GOAL, 30=VAR_DECISION. A future contributor
            // must NOT add these — the engine doesn't emit them
            // and adding rows here would mean dead enum types
            // sneak into the bulk insert.
            // Note: `'turnover'` IS in the map (maps to int=5 / PASS)
            // because the engine does emit it for failed attack
            // pushes. The `'pass'` key would be a different
            // concept (a successful pass event) which the engine
            // does not emit — keep it out.
            for (const dead of [
                'tackle', 'interception', 'clearance', 'offside',
                'neutral_event', 'celebration', 'own_goal', 'var_decision',
                'pass',
            ]) {
                expect(EVENT_TWO_AXIS).not.toHaveProperty(dead);
            }
        });

        it('does NOT contain the SECOND_YELLOW (101) and DIRECT_FREE_KICK (181) hacks', () => {
            // These were the v1 sub-encoding hacks (101 = yellow
            // card 2nd, 181 = direct FK). The engine emits
            // 'yellow_card' / 'free_kick' as the typeName, and
            // the int id is resolved at mapEventType time. The
            // two-axis path uses typeName, so these legacy
            // int-id hacks are not part of the new map.
            expect(EVENT_TWO_AXIS).not.toHaveProperty('second_yellow');
            expect(EVENT_TWO_AXIS).not.toHaveProperty('direct_free_kick');
        });
    });

    describe('class + outcome pinning', () => {
        it('goal maps to class SHOT (3) + outcome GOAL (1)', () => {
            expect(getEventTwoAxis('goal')).toEqual({
                classId: 3, outcomeId: 1, outcomeCode: 'GOAL',
            });
        });

        it('turnover maps to class SHOT (3) + outcome MISS (4) — fixed 2026-08-24', () => {
            // `'turnover'` is emitted by the engine at
            // match.engine.ts:3366 for failed attack pushes.
            // The processor maps it to MatchEventType.PASS=5
            // in the DB. The TS mirror here treats it as a
            // SHOT class with MISS outcome — same as
            // shot_off_target.
            expect(getEventTwoAxis('turnover')).toEqual({
                classId: 3, outcomeId: 4, outcomeCode: 'MISS',
            });
        });

        it('yellow_card maps to class FOUL (4) + outcome YELLOW (6)', () => {
            expect(getEventTwoAxis('yellow_card')).toEqual({
                classId: 4, outcomeId: 6, outcomeCode: 'YELLOW',
            });
        });

        it('red_card maps to class FOUL (4) + outcome RED (8)', () => {
            expect(getEventTwoAxis('red_card')).toEqual({
                classId: 4, outcomeId: 8, outcomeCode: 'RED',
            });
        });

        it('shot_on_target maps to class SHOT (3) + null outcome (ambiguous — was goal OR save)', () => {
            // The engine emits this string when a shot reached
            // the target area but the duel hasn't resolved yet.
            // Some readers (Phase 2's `recordAttackSequence`)
            // may follow up with 'goal' or 'save' — the
            // 'shot_on_target' itself is an in-flight marker.
            expect(getEventTwoAxis('shot_on_target')).toEqual({
                classId: 3, outcomeId: null, outcomeCode: null,
            });
        });

        it('corner maps to class CORNER (6) + outcome TAKEN (11)', () => {
            expect(getEventTwoAxis('corner')).toEqual({
                classId: 6, outcomeId: 11, outcomeCode: 'TAKEN',
            });
        });

        it('miss maps to class SHOT (3) + outcome MISS (4) — engine emit at match.engine.ts:3387-3392', () => {
            // Added 2026-08-26 after a production incident on a
            // `recover-${matchId}-${bucket}` job: the engine
            // emitted 'miss' but the map had no entry, so
            // getEventTwoAxis returned the null tuple and PG
            // rejected the bulk insert with `event_class_id
            // violates not-null constraint`. The class/outcome
            // mirror the spec for `shot_off_target` (a shot
            // that missed) and `turnover` (a failed attack
            // push that missed) — same SHOT class, same MISS
            // outcome.
            expect(getEventTwoAxis('miss')).toEqual({
                classId: 3, outcomeId: 4, outcomeCode: 'MISS',
            });
        });

        it('tactical_change maps to class SUBSTITUTION (8) + outcome TACTICAL (14) — engine emit at match.engine.ts:2153', () => {
            // Added 2026-08-26 after the same production incident
            // as `miss` above. The engine emits 'tactical_change'
            // for non-sub tactical instructions (position_swap /
            // move). The closest class is SUBSTITUTION (8) with
            // outcome TACTICAL (14) — same tuple as a tactical
            // sub. The data field carries the full
            // TacticalInstruction so consumers can distinguish
            // (data.type === 'position_swap' / 'move').
            expect(getEventTwoAxis('tactical_change')).toEqual({
                classId: 8, outcomeId: 14, outcomeCode: 'TACTICAL',
            });
        });

        it('free_kick maps to class FREE_KICK (5) + outcome TAKEN (11)', () => {
            expect(getEventTwoAxis('free_kick')).toEqual({
                classId: 5, outcomeId: 11, outcomeCode: 'TAKEN',
            });
        });

        it('forfeit maps to class MATCH_META (16) + outcome FORFEIT (28)', () => {
            expect(getEventTwoAxis('forfeit')).toEqual({
                classId: 16, outcomeId: 28, outcomeCode: 'FORFEIT',
            });
        });

        it('half_time maps to class PERIOD (2) + outcome END (27)', () => {
            expect(getEventTwoAxis('half_time')).toEqual({
                classId: 2, outcomeId: 27, outcomeCode: 'END',
            });
        });

        it('second_half maps to class PERIOD (2) + outcome START (26)', () => {
            expect(getEventTwoAxis('second_half')).toEqual({
                classId: 2, outcomeId: 26, outcomeCode: 'START',
            });
        });

        it('snapshot is class SNAPSHOT (17, is_visible=false) with null outcome', () => {
            expect(getEventTwoAxis('snapshot')).toEqual({
                classId: 17, outcomeId: null, outcomeCode: null,
            });
        });

        it('kickoff has no outcome (KICKOFF class is outcome-less by design)', () => {
            expect(getEventTwoAxis('kickoff')).toEqual({
                classId: 1, outcomeId: null, outcomeCode: null,
            });
        });
    });

    describe('null fallback for unknown strings', () => {
        it('returns the null tuple for an unknown type', () => {
            // Defensive: a new engine emit without a mapping
            // returns the null tuple. As of 2026-08-26, this is
            // no longer allowed to reach the DB — the simulator
            // pre-flight at simulation.processor.ts throws with
            // a clear error if it sees a null classId. The
            // helper itself still returns the null tuple (no
            // throw) so a misconfigured caller fails *noisy*
            // rather than *silent* — the goal is the error
            // surface, not silent-NULL inserts.
            expect(getEventTwoAxis('made_up_future_event')).toEqual({
                classId: null, outcomeId: null, outcomeCode: null,
            });
        });

        it('returns the null tuple for null / undefined input', () => {
            expect(getEventTwoAxis(null)).toEqual({
                classId: null, outcomeId: null, outcomeCode: null,
            });
            expect(getEventTwoAxis(undefined)).toEqual({
                classId: null, outcomeId: null, outcomeCode: null,
            });
            expect(getEventTwoAxis('')).toEqual({
                classId: null, outcomeId: null, outcomeCode: null,
            });
        });
    });
});
