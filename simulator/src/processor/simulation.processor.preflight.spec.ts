/**
 * RFC 0002 P3 — `assertAllEventsMapped` pre-flight tripwire.
 *
 * Pure / static function. Spec'd here (separate from the
 * Nest-DI-heavy `simulation.processor.spec.ts`) so the
 * assertions are independent of any test-container setup and
 * run in <100ms.
 *
 * 2026-08-26 production incident: the engine emitted
 * `'tactical_change'` for a `position_swap` tactical
 * instruction, the map had no entry, and the bulk insert
 * wrote `event_class_id=NULL`. Migration 1788000000002 made
 * the column NOT NULL, so PG rejected the row with a cryptic
 * "violates not-null constraint" error. This pre-flight is
 * the simulator-side fix: throw with a clear error
 * referencing the offending typeName before the row reaches
 * PG.
 */
import { SimulationProcessor } from './simulation.processor';

describe('SimulationProcessor.assertAllEventsMapped (RFC 0002 P3 tripwire)', () => {
  const matchId = 'test-match-001';

  it('returns void for a fully-mapped event set', () => {
    // The 22 strings the engine currently emits. A new match
    // simulation in production today would produce some
    // subset of these — the pre-flight is a no-op when all
    // are mapped.
    const events = [
      { type: 'kickoff' },
      { type: 'goal' },
      { type: 'miss' },         // added 2026-08-26
      { type: 'turnover' },
      { type: 'yellow_card' },
      { type: 'red_card' },
      { type: 'corner' },
      { type: 'free_kick' },
      { type: 'substitution' },
      { type: 'injury' },
      { type: 'tactical_change' }, // added 2026-08-26
      { type: 'snapshot' },
      { type: 'half_time' },
      { type: 'second_half' },
      { type: 'full_time' },
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).not.toThrow();
  });

  it('throws with a clear, actionable error when an event has no mapping', () => {
    // Simulate a future engine emit that nobody added to
    // EVENT_TWO_AXIS yet.
    const events = [
      { type: 'kickoff' },
      { type: 'goal' },
      { type: 'extra_time_penalty_kick' }, // <-- unmapped
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).toThrow(
      /\[simulation\] match=test-match-001 produced 3 events; 1 distinct typeName\(s\) have no EVENT_TWO_AXIS mapping: extra_time_penalty_kick/,
    );
  });

  it('deduplicates offending typeNames in the error message', () => {
    // 6 events, only 2 distinct offending typeNames. The
    // error must report the unique count, not the event
    // count — otherwise a 200-event match with 1 unmapped
    // type would dump 200 typeNames into the log. Set
    // iteration order in JS is insertion order, so the
    // listed order matches the first-occurrence order in
    // the event array.
    const events = [
      { type: 'kickoff' },
      { type: 'phantom_event' },
      { type: 'goal' },
      { type: 'phantom_event' },
      { type: 'phantom_event' },
      { type: 'another_phantom' },
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).toThrow(
      /2 distinct typeName\(s\) have no EVENT_TWO_AXIS mapping: phantom_event, another_phantom/,
    );
  });

  it('truncates the offending list to 5 entries for readability', () => {
    // 6 distinct unmapped types → 6 in the set, error must
    // show only 5 + an ellipsis. The full set is still in
    // the simulator's structured logs via the throw
    // payload.
    const events = [
      { type: 'phantom_1' },
      { type: 'phantom_2' },
      { type: 'phantom_3' },
      { type: 'phantom_4' },
      { type: 'phantom_5' },
      { type: 'phantom_6' },
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).toThrow(/6 distinct typeName.*phantom_1, phantom_2, phantom_3, phantom_4, phantom_5, \.\.\./);
  });

  it('treats null / undefined type as non-offending but flags empty string (defensive)', () => {
    // `null` and `undefined` mean "no type at all" — the
    // engine should never push those, but if it does,
    // the pre-flight skips them so the *real* unmapped
    // type (the next entry) surfaces in the log. Empty
    // string `''` is a different case: the engine pushed
    // SOMETHING and `''` is genuinely not in the map —
    // flag it so the operator sees the engine bug.
    const events = [
      { type: null },
      { type: undefined },
      { type: 'goal' },
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).not.toThrow();

    // Empty string is a real bug at the engine layer.
    const eventsWithEmpty = [
      { type: '' },
      { type: 'goal' },
    ];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(eventsWithEmpty, matchId, 'simulation'),
    ).toThrow(/1 distinct typeName.*: \./);
  });

  it('uses the `forfeit` path label in the error when called from the forfeit branch', () => {
    // The processor's forfeit path calls this with
    // `path='forfeit'`. The error must reflect the right
    // branch so an operator can tell at a glance which
    // bulk-insert site tripped.
    const events = [{ type: 'extra_time_penalty_kick' }];
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'forfeit'),
    ).toThrow(/\[forfeit\] match=/);
  });

  it('accepts ReadonlyArray (caller does not need to clone)', () => {
    // The bulk-insert sites pass `events` (a real `MatchEvent[]`).
    // The function declares `ReadonlyArray<...>` so a future
    // caller that wants to pass an immutable view doesn't
    // have to cast. Pin the call signature works.
    const events: ReadonlyArray<{ type?: string | null }> = Object.freeze([
      { type: 'kickoff' },
    ]);
    expect(() =>
      SimulationProcessor.assertAllEventsMapped(events, matchId, 'simulation'),
    ).not.toThrow();
  });
});
