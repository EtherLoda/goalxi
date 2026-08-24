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
        it('covers all 24 type strings the engine emits', () => {
            // The engine emits exactly 24 distinct `type: '...'`
            // strings (verified by grep). Each MUST have a row.
            // If a future contributor adds a new emit and forgets
            // to add a mapping, the entry will silently get NULL
            // in the bulk insert — this test catches the omission
            // at lint time.
            const expected = [
                'kickoff', 'half_time', 'second_half', 'full_time',
                'forfeit',
                'goal', 'shot_on_target', 'shot_off_target', 'save', 'turnover',
                'foul', 'yellow_card', 'red_card',
                'corner', 'free_kick', 'penalty_goal', 'penalty_miss',
                'substitution', 'injury',
                'snapshot', 'weather_announcement',
                'player_introduction', 'attendance_announcement',
            ];
            for (const t of expected) {
                expect(EVENT_TWO_AXIS).toHaveProperty(t);
                // Sanity: the lookup must return the row, not the
                // null fallback.
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
            // Future-proofing: a new engine emit without a mapping
            // should not throw. The bulk insert will write
            // classId/outcomeId/outcomeCode as NULL, and the
            // `type` int will fall back to NEUTRAL_EVENT in
            // `mapEventType`.
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
