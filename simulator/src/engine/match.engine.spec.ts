import { MatchEngine } from './match.engine';
import { Team } from './classes/Team';
import { TacticalPlayer } from './types/simulation.types';
import { Player } from '../types/player.types';
import { MatchEvent } from './match.engine';
import { BenchConfig } from '@goalxi/database';

describe('MatchEngine', () => {
  let homeTeam: Team;
  let awayTeam: Team;
  let engine: MatchEngine;

  // Helper to create mock players
  const createMockPlayer = (id: number, name: string, ovr: number): Player => ({
    id,
    name,
    position: 'CM',
    exactAge: [25, 0],
    attributes: {
      finishing: ovr,
      composure: ovr,
      positioning: ovr,
      strength: ovr,
      pace: ovr,
      dribbling: ovr,
      passing: ovr,
      defending: ovr,
      freeKicks: 50,
      penalties: 50,
      gk_reflexes: 50,
      gk_handling: 50,
      gk_aerial: 50,
    },
    currentStamina: 3,
    form: 5,
    experience: 10,
  });

  // Helper to create mock team
  const createMockTeam = (name: string, avgOvr: number): Team => {
    const players: TacticalPlayer[] = [];
    for (let i = 0; i < 11; i++) {
      players.push({
        player: createMockPlayer(i, `${name} Player ${i}`, avgOvr),
        positionKey: i === 0 ? 'GK' : 'CM',
      });
    }
    return new Team(name, players);
  };

  // Diverse-position team for push-duel tests. The standard
  // `createMockTeam` only fills `GK` + 10 × `CM` — fine for the
  // legacy "events emitted" suite, but the push-phase slot
  // weight tables (`PUSH_ATTACKER_WEIGHT` /
  // `PUSH_DEFENDER_WEIGHT`) need at least one eligible slot in
  // each table row to actually pick a player. The shape below is
  // a 4-4-2: GK / 2 CB / LB+RB / 2 CM / LM+RM / 2 CF. Every
  // non-empty position has a non-zero weight on either side of
  // the table for at least one lane, so the picker is exercised
  // across all three lanes.
  const createDiverseMockTeam = (name: string, avgOvr: number): Team => {
    const positions: Array<{ pos: string; attrOverride?: Partial<{ dribbling: number; passing: number; pace: number; defending: number; positioning: number; composure: number }> }> = [
      { pos: 'GK' },
      { pos: 'LB' },
      { pos: 'CB' },
      { pos: 'CB' },
      { pos: 'RB' },
      { pos: 'LM' },
      { pos: 'CM' },
      { pos: 'CM' },
      { pos: 'RM' },
      { pos: 'CF' },
      { pos: 'CF' },
    ];
    const players: TacticalPlayer[] = positions.map(({ pos, attrOverride }, i) => {
      const p = createMockPlayer(i, `${name} Player ${i}`, avgOvr);
      if (attrOverride) Object.assign(p.attributes, attrOverride);
      return { player: p, positionKey: pos };
    });
    return new Team(name, players);
  };

  beforeEach(() => {
    homeTeam = createMockTeam('HomeFC', 80);
    awayTeam = createMockTeam('AwayFC', 80);
    engine = new MatchEngine(homeTeam, awayTeam);
  });

  it('should initialize with teams', () => {
    expect(engine.homeTeam).toBeDefined();
    expect(engine.awayTeam).toBeDefined();
  });

  it('should simulate regular time (90 mins) and generate events', () => {
    const events = engine.simulateMatch();
    expect(events.length).toBeGreaterThan(0);

    // Check for Kickoff event
    const firstEvent = events[0];
    expect(firstEvent.type).toBe('kickoff');
    expect(firstEvent.minute).toBe(0);

    // Check if last event is full_time
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('full_time');
    expect(lastEvent.minute).toBeGreaterThanOrEqual(90);
  });

  it('should track score internally during regular time', () => {
    // We can't access private score properties directly on engine,
    // but we can infer from events or assume engine logic holds.
    // Actually, let's trust the public method returns events with goals.
    const events = engine.simulateMatch();
    const goals = events.filter((e) => e.type === 'goal');
    // Just verify goals have correct structure
    goals.forEach((g) => {
      expect(g.teamName).toBeDefined();
      expect(g.playerId).toBeDefined();
    });
  });

  it('should update player condition (stamina) during simulation', () => {
    engine.simulateMatch();
    const player = homeTeam.players[1].player; // Outfield
    const currentEnergy = engine.homeTeam.getPlayerEnergy(player.id);
    expect(currentEnergy).toBeDefined();
    expect(currentEnergy).toBeLessThan(100);
  });

  it('should simulate extra time and continue generating events', () => {
    engine.simulateMatch();
    // Engine now refuses out-of-order or repeat calls (see
    // `phase` state machine in match.engine). A second
    // `simulateExtraTime()` would have silently appended more
    // events to the array, which the persistence layer would
    // then double-insert into `match_event` on retry. The guard
    // turns that footgun into an error.
    const allEvents = engine.simulateExtraTime();

    expect(allEvents.length).toBeGreaterThan(0);
    const lastEvent = allEvents[allEvents.length - 1];
    expect(lastEvent.minute).toBeGreaterThan(90);
    // [RFC injury-time-2026] ET now ends at 120 + ET 2nd-half
    // stoppage (0-5). Upper bound widened from 120 to 125 to
    // accommodate a full 5-min injury time at the end of ET.
    expect(lastEvent.minute).toBeLessThanOrEqual(125);
  });

  it('rejects a second call to simulateExtraTime (no duplicate event append)', () => {
    engine.simulateMatch();
    engine.simulateExtraTime();
    expect(() => engine.simulateExtraTime()).toThrow(
      /simulateExtraTime.*phase 'extra'/,
    );
  });

  it('rejects simulateExtraTime before simulateMatch', () => {
    expect(() => engine.simulateExtraTime()).toThrow(
      /simulateExtraTime.*phase 'idle'/,
    );
  });

  it('rejects simulatePenaltyShootout before simulateMatch', () => {
    expect(() => engine.simulatePenaltyShootout()).toThrow(
      /simulatePenaltyShootout.*phase 'idle'/,
    );
  });

  it('rejects a second call to simulateMatch on the same engine', () => {
    engine.simulateMatch();
    expect(() => engine.simulateMatch()).toThrow(
      /simulateMatch.*phase 'match'/,
    );
  });

  it('should apply extra time break recovery', () => {
    engine.simulateMatch();
    const staminaAfter90 = homeTeam.players[1].player.currentStamina;

    // This test is tricky because `simulateExtraTime` runs the recovery internally before we can sample it efficiently
    // unless we mock `updateCondition`.
    // But we can check that stamina *eventually* drops further after 120 mins compared to 90?
    // Actually, recovery adds stamina.
    // So stamina after 91 mins might be higher than 90 if no action happened?
    // We'll trust unit logic for now or mock if needed.
    // Let's just verify it runs without error.
    expect(() => engine.simulateExtraTime()).not.toThrow();
  });

  it('should persist score from regular time to extra time', () => {
    // Force a goal in regular time by hacking?
    // Or better, just ensure logic flow relies on internal state.
    // We will mock simulateKeyMoment to force a goal?
    // Too complex for now. We implicitly tested this with verification script.
    // Just ensure events flow is continuous.
    engine.simulateMatch();
    const events90 = [...engine['events']]; // access private

    const eventsET = engine.simulateExtraTime();
    // The first N events of ET should optionally be same as 90 (if it appends)?
    // Yes, `this.events` accumulates.
    expect(eventsET.length).toBeGreaterThanOrEqual(events90.length);
    expect(eventsET.slice(0, events90.length)).toEqual(events90);
  });
  it('should generate snapshot events periodically', () => {
    engine.simulateMatch();
    // Access private 'events' property via casting to any or bracket notation
    const events = (engine as any).events as MatchEvent[];
    const snapshots = events.filter((e) => e.type === 'snapshot');

    expect(snapshots.length).toBeGreaterThan(0);

    const firstSnapshot = snapshots[0];
    expect(firstSnapshot.data).toBeDefined();
    expect(firstSnapshot.data.h).toBeDefined();
    expect(firstSnapshot.data.h.ls).toBeDefined();
    expect(firstSnapshot.data.h.ps).toBeDefined(); // player states
    expect(firstSnapshot.data.h.ps.length).toBeGreaterThan(0);
  });

  it('snapshot lane counters (att / ps_) are non-decreasing and final ≥ any prior', () => {
    // The lane counters in the snapshot are running totals since engine
    // start — they only ever go up. The final snapshot's totals are the
    // whole-match totals, and the FE computes `pushRate = ps_ / att`
    // directly from these counters (no sigmoid reimplementation).
    engine.simulateMatch();
    const events = (engine as any).events as MatchEvent[];
    const snapshots = events
      .filter((e) => e.type === 'snapshot')
      .sort((a, b) => a.minute - b.minute);

    expect(snapshots.length).toBeGreaterThan(1);

    const laneTotals = (
      lc:
        | {
            left: { att: number; ps_: number };
            center: { att: number; ps_: number };
            right: { att: number; ps_: number };
          }
        | undefined,
      lane: 'left' | 'center' | 'right',
    ) => {
      const cell = lc?.[lane] ?? { att: 0, ps_: 0 };
      return cell;
    };

    // Monotonicity check across all snapshot pairs.
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapshots[i - 1].data.h.lc;
      const curr = snapshots[i].data.h.lc;
      for (const lane of ['left', 'center', 'right'] as const) {
        const p = laneTotals(prev, lane);
        const c = laneTotals(curr, lane);
        expect(c.att).toBeGreaterThanOrEqual(p.att);
        expect(c.ps_).toBeGreaterThanOrEqual(p.ps_);
        // ps_ never exceeds att — a push success must come from an attempt.
        expect(c.ps_).toBeLessThanOrEqual(c.att);
      }
    }

    // Final snapshot totals are the whole-match totals — both teams.
    const final = snapshots[snapshots.length - 1];
    const homeTotalAtt = ['left', 'center', 'right'].reduce(
      (sum, lane) =>
        sum +
        laneTotals(final.data.h.lc, lane as 'left' | 'center' | 'right').att,
      0,
    );
    const awayTotalAtt = ['left', 'center', 'right'].reduce(
      (sum, lane) =>
        sum +
        laneTotals(final.data.a.lc, lane as 'left' | 'center' | 'right').att,
      0,
    );
    expect(homeTotalAtt + awayTotalAtt).toBeGreaterThan(0);
  });

  describe('event-driven snapshot emission (goal / red_card / sub / injury)', () => {
    // Spec: when any of {goal, red_card, substitution} happens, the
    // engine emits a follow-up `snapshot` event at the same minute so
    // the FE timeline can land on the post-event lineup / state.
    //
    // We test this by running the engine a small number of times and
    // asserting that every goal / red_card / substitution row has at
    // least one snapshot row at the same minute. We don't pin exact
    // counts because the event distribution is stochastic; the
    // "≥ expected" bound keeps the test resilient to RNG drift.
    //
    // Why a loop: a single match may legitimately produce zero
    // goals / red_cards / subs (low-quality sim run), which would
    // make the test trivially pass with no signal. 30 runs makes
    // the odds of seeing each event type overwhelmingly high while
    // keeping the suite under a second.

    const RUNS = 30;

    /**
     * Build a `MatchEngine` with a planned swap at minute 60 so the
     * substitution path always fires. The base mock team has 11
     * players and no bench / no tactical instructions, which means
     * `applyInstructionsForTeam` has nothing to do and the only way
     * to produce a `substitution` event is the injury path (which
     * is gated by chance + bench config). Without this helper the
     * SUBSTITUTION test loops 30 times and sees zero subs, so the
     * `expect(sawSub).toBe(true)` line trips even when the engine
     * behaviour is correct.
     */
    function buildEngineWithPlannedSub(): MatchEngine {
      // 5 substitutes covering one per bench position group. The
      // planned swap targets the CM slot, so #15 (CM) is the one
      // that actually gets subbed in; the others are there so the
      // `BenchConfig` shape is complete and the engine doesn't
      // crash on lookup for the other position groups.
      const subSpecs: Array<{ id: number; position: string; slot: keyof BenchConfig }> = [
        { id: 11, position: 'GK', slot: 'goalkeeper' },
        { id: 12, position: 'CD', slot: 'centerBack' },
        { id: 13, position: 'FB', slot: 'fullback' },
        { id: 14, position: 'W', slot: 'winger' },
        { id: 15, position: 'CM', slot: 'centralMidfield' },
      ];
      const homeSubs: TacticalPlayer[] = subSpecs.map(
        ({ id, position }) => ({
          player: createMockPlayer(id, `Home Sub ${id}`, 70),
          positionKey: position,
        }),
      );
      const homeWithSubs = new Team('HomeFC', [
        ...homeTeam.players,
        ...homeSubs,
      ]);

      const homeBenchConfig: BenchConfig = {
        goalkeeper: 11,
        centerBack: 12,
        fullback: 13,
        winger: 14,
        centralMidfield: 15,
        forward: null,
      };

      const substitutePlayers = new Map<number, TacticalPlayer>();
      for (const p of homeSubs) {
        substitutePlayers.set((p.player as Player).id, p);
      }

      // The base mock has 1 GK + 10 CM, so id=5 is a CM. Swap
      // them out for sub #15 (also CM) at minute 60. `condition`
      // left as `always` so the test isn't sensitive to score
      // state — the swap should fire regardless of who is leading.
      const homeInstructions = [
        {
          minute: 60,
          type: 'swap' as const,
          playerId: 5,
          newPlayerId: 15,
          newPosition: 'CM',
          condition: 'always' as const,
        },
      ];

      return new MatchEngine(
        homeWithSubs,
        awayTeam,
        homeInstructions,
        [],
        substitutePlayers,
        homeBenchConfig,
        null,
      );
    }

    function collectEvents(useSub: boolean): MatchEvent[] {
      // Fresh engine per iteration to avoid the `phase` state machine
      // throwing on a second `simulateMatch()` call.
      const testEngine = useSub
        ? buildEngineWithPlannedSub()
        : new MatchEngine(homeTeam, awayTeam);
      return testEngine.simulateMatch();
    }

    function snapshotsAt(events: MatchEvent[], minute: number): number {
      return events.filter(
        (e) => e.type === 'snapshot' && e.minute === minute,
      ).length;
    }

    it('every GOAL is followed by a snapshot at the same minute', () => {
      let sawGoal = false;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents(false);
        const goals = events.filter((e) => e.type === 'goal');
        for (const g of goals) {
          sawGoal = true;
          // A goal at minute M should produce at least one snapshot
          // at the same minute M. The 5-minute cadence also covers
          // some of them; this is the explicit event-driven emit the
          // user asked for (so every goal, open-play or set-piece,
          // can be landed on via the timeline).
          expect(snapshotsAt(events, g.minute)).toBeGreaterThanOrEqual(1);
        }
      }
      // We expect a goal across 30 sims; if not, RNG is in a very
      // odd spot and the assertion above is meaningless.
      expect(sawGoal).toBe(true);
    });

    it('every RED_CARD is followed by a snapshot at the same minute', () => {
      let sawRed = false;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents(false);
        const reds = events.filter((e) => e.type === 'red_card');
        for (const r of reds) {
          sawRed = true;
          expect(snapshotsAt(events, r.minute)).toBeGreaterThanOrEqual(1);
        }
      }
      expect(sawRed).toBe(true);
    });

    it('every SUBSTITUTION is followed by a snapshot at the same minute', () => {
      let sawSub = false;
      for (let i = 0; i < RUNS; i++) {
        // Use the planned-sub engine so the swap at minute 60
        // always fires — without it, RNG alone can't be relied on
        // to produce a sub within 30 sims of an 11-player team with
        // no bench config.
        const events = collectEvents(true);
        // `substitution` covers both player swaps (manual) and
        // injury-forced subs; both should fire a snapshot.
        const subs = events.filter((e) => e.type === 'substitution');
        for (const s of subs) {
          sawSub = true;
          expect(snapshotsAt(events, s.minute)).toBeGreaterThanOrEqual(1);
        }
      }
      expect(sawSub).toBe(true);
    });

    it('event-driven snapshot count is roughly (#goals + #red_cards + #subs) extra', () => {
      // The total snapshot count is:
      //   cadence snapshots (every 5 min + 45/46/90 ≈ 21) +
      //   one extra per goal / red_card / substitution.
      // We can't pin the exact cadence number across RNG, but we
      // can assert the delta between (snapshots) and (events that
      // DON'T drive a snapshot) is at least the count of those
      // events. The lower bound catches a regression where the
      // follow-up emit silently stops working.
      //
      // We use the planned-sub engine here too so the substitution
      // driver count is deterministic (= 1 per run). Otherwise the
      // test only sees the stochastic goal / red_card path and the
      // "drivers vs extras" comparison becomes too noisy.
      let extras = 0;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents(true);
        const snapshots = events.filter((e) => e.type === 'snapshot');
        const drivers = events.filter(
          (e) =>
            e.type === 'goal' ||
            e.type === 'red_card' ||
            e.type === 'substitution',
        ).length;
        // Cadence at minute 0/45/46/90/5/10/.../85 = 21 snapshots
        // for a 90-min match. Anything above that should be at
        // least the driver count (it can be more if the cadence
        // tick happens to land on the same minute as a driver).
        const cadenceFloor = 21;
        const observedExtras = snapshots.length - cadenceFloor;
        extras += Math.max(0, drivers - observedExtras);
      }
      // Sum of (drivers - observedExtras) across RUNS should be
      // small; large numbers mean the follow-up snapshot is missing
      // for many events. We allow some slack for cadence-snapshot
      // overlap (a driver on minute 5 doesn't add a new snapshot
      // because one is already emitted at minute 5).
      expect(extras).toBeLessThanOrEqual(RUNS);
    });
  });

  describe('push phase player duel (slot-weighted picker + marginal)', () => {
    // The push phase now picks one attacker and one defender per
    // sequence using integer slot-weight tables (see
    // PUSH_ATTACKER_WEIGHT / PUSH_DEFENDER_WEIGHT at the top of
    // match.engine.ts). Their composite skill differential is
    // folded into the team-level push probability as a `[-0.1, 0.1]`
    // marginal. These tests pin down the four observable surfaces:
    //   1. attacker / defender names make it onto the event
    //   2. composite + marginal are surfaced in the attack push payload
    //   3. turnover's `relatedPlayerId` is the same player the event
    //      names as the tackler (no more drift between the two paths)
    //   4. the marginal respects the `[-0.1, 0.1]` hard cap
    //
    // We don't unit-test the picker directly — it's a private method
    // and the weight tables are top-level constants. The 30-run loop
    // below exercises both the open-play push path and (by
    // construction) the LONG_SHOT path's "no 1-v-1" shape.
    //
    // We override the default `homeTeam` / `awayTeam` (both
    // 11 × `CM`) with a 4-4-2 mix so the slot-weight tables can
    // actually pick a player on every lane — the `createMockTeam`
    // shape leaves every weight-table entry (other than `GK`)
    // unoccupied, so the picker always returned `null` and the
    // test asserted nothing useful.

    // 100 runs is heavy (~10s) but needed: turnover is gated by a
    // 50% push-failure rate compounded with the lane/shot-result
    // distribution, so 30 runs can come up empty when the RNG is
    // unkind. `convex-regression` is the same kind of fix — N=200
    // for stable empirical reads.
    const RUNS = 100;

    // Construct a **fresh** team pair per iteration. Sharing a pair
    // across 100 sims would let cumulative state — `isSentOff`,
    // `injuredThisMatch`, fitness decay — bleed from one sim into
    // the next, so by sim 30 most of the diverse team's 11 players
    // are red-carded and the slot-weight picker returns `null`
    // every time. The standard `createMockTeam` 11 × `CM` setup
    // also shares this issue — the existing test suite happens to
    // be tolerant because every CM candidate maps to a 0-weight
    // entry on every lane, so the picker was always returning
    // `null` and no one noticed.
    function collectEvents(): MatchEvent[] {
      const home = createDiverseMockTeam('HomeFC', 80);
      const away = createDiverseMockTeam('AwayFC', 80);
      const testEngine = new MatchEngine(home, away);
      return testEngine.simulateMatch();
    }

    it('every push/shot event carries attacker + defender names', () => {
      // We look at any event with a `data.sequence.attackPush`
      // payload — i.e. shot / miss / save / goal / turnover / blocked.
      // All of them should have attacker named; defender named for the
      // push duel (shot / turnover / save / miss / goal), `undefined`
      // for LONG_SHOT (we test that one separately). The `data?
      // .sequence?.attackPush` truthiness check naturally filters
      // out every event type that doesn't carry a push payload —
      // kickoff, weather / attendance / player introduction, fouls,
      // cards, subs, injuries, set pieces, etc.
      let saw = 0;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents();
        for (const e of events) {
          const data = (e as any).data as any;
          if (!data?.sequence?.attackPush) continue;
          // Long shots leave `defendingPlayer = undefined` in the
          // payload; skip them — they're covered by the next test.
          if (data.sequence.attackPush.defendingPlayer === undefined) continue;
          expect(typeof data.sequence.attackPush.attackingPlayer).toBe(
            'string',
          );
          expect(typeof data.sequence.attackPush.defendingPlayer).toBe(
            'string',
          );
          saw += 1;
        }
      }
      // We expect to see at least a few push events in 30 sims; if
      // not, something is structurally off and the rest of the
      // assertions are meaningless.
      expect(saw).toBeGreaterThan(0);
    });

    it('LONG_SHOT path leaves defender null and marginal at 0', () => {
      // Long shots set `pushDuelAttacker = shooter` and
      // `pushDuelDefender = null` (see the LONG_SHOT branch in
      // simulateKeyMoment). The event payload should reflect this:
      // `defendingPlayer` is `undefined` (no 1-v-1 happened),
      // `defenderComposite` is `null` (the engine never computed
      // one), and `playerMarginal` is `0` (no fold into push P
      // either).
      let sawLongShot = 0;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents();
        for (const e of events) {
          const data = (e as any).data as any;
          if (!data?.sequence?.attackPush) continue;
          // The shot sub-object carries the shot type — only LONG_SHOT
          // satisfies this branch.
          if (data.sequence.shot?.shotType !== 'LONG_SHOT') continue;
          expect(data.sequence.attackPush.defendingPlayer).toBeUndefined();
          expect(data.sequence.attackPush.defenderComposite).toBeNull();
          expect(data.sequence.attackPush.playerMarginal).toBe(0);
          sawLongShot += 1;
        }
      }
      // LONG_SHOT is the rarest attack type — we may not see one in
      // 30 sims. If we don't, just assert that the absence didn't
      // crash anything (this test then "passes vacuously"). If we
      // did see at least one, the structural assertions above fire.
      if (sawLongShot === 0) {
        // Sanity: the loop completed without exception.
        expect(true).toBe(true);
      }
    });

    it('attackerComposite / defenderComposite / playerMarginal are surfaced and well-formed', () => {
      // Spot-check the three new fields on push events. We don't pin
      // exact values (the marginal is stochastic) but we lock down
      // the surface contract: types, ranges, presence.
      //
      // Both composites can be `null` when the picker couldn't find
      // a candidate (e.g. an exotic formation with no eligible
      // slot). We skip those events because the type contract then
      // degenerates to "null on one or both sides", which the
      // `LONG_SHOT` test already covers in spirit. We focus here
      // on the happy path: a real 1-v-1 push with two named
      // players.
      let saw = 0;
      for (let i = 0; i < RUNS; i++) {
        const events = collectEvents();
        for (const e of events) {
          const data = (e as any).data as any;
          if (!data?.sequence?.attackPush) continue;
          if (data.sequence.attackPush.defendingPlayer === undefined) continue;
          const att = data.sequence.attackPush.attackerComposite;
          const def = data.sequence.attackPush.defenderComposite;
          const m = data.sequence.attackPush.playerMarginal;
          // Skip degenerate cases where the picker couldn't fill
          // both sides (rare but possible — e.g. a formation with
          // no eligible slot on one side). The `null` for these
          // two composites is covered by `LONG_SHOT`; the
          // happy-path shape we test here is "both numbers set".
          if (att === null || def === null) continue;
          expect(typeof att).toBe('number');
          expect(typeof def).toBe('number');
          expect(att).toBeGreaterThanOrEqual(0);
          expect(att).toBeLessThanOrEqual(100);
          expect(def).toBeGreaterThanOrEqual(0);
          expect(def).toBeLessThanOrEqual(100);
          expect(m).toBeGreaterThanOrEqual(-0.1);
          expect(m).toBeLessThanOrEqual(0.1);
          saw += 1;
        }
      }
      expect(saw).toBeGreaterThan(0);
    });

    it('turnover event relatedPlayerId matches the attackPush defendingPlayer', () => {
      // Before this change, the event's `relatedPlayerId` for a
      // turnover was sourced from a separate uniform-random defender
      // pick, which could disagree with the player the event payload
      // named as the tackler. After the change, both come from the
      // same `pushDuelDefender` slot.
      //
      // Each iteration builds fresh rosters (see `collectEvents`)
      // so the cumulative-red-card state across sims doesn't
      // starve the picker. We capture the same rosters in the
      // closure for the name → id lookup.
      let sawTurnover = false;
      for (let i = 0; i < RUNS; i++) {
        const home = createDiverseMockTeam('HomeFC', 80);
        const away = createDiverseMockTeam('AwayFC', 80);
        const events = new MatchEngine(home, away).simulateMatch();
        for (const e of events) {
          if (e.type !== 'turnover') continue;
          const data = (e as any).data as any;
          const tacklerName = data?.sequence?.attackPush?.defendingPlayer;
          if (tacklerName === undefined) continue;
          // Resolve the named tackler to an ID via the same
          // rosters we just simulated. Either side could be the
          // tackler — turnover flips possession.
          const homeMatch = home.players.find(
            (p) => (p.player as Player).name === tacklerName,
          );
          const awayMatch = away.players.find(
            (p) => (p.player as Player).name === tacklerName,
          );
          const expectedId = (homeMatch ?? awayMatch)?.player?.id;
          expect(expectedId).toBeDefined();
          expect(e.relatedPlayerId).toBe(expectedId);
          sawTurnover = true;
        }
      }
      expect(sawTurnover).toBe(true);
    });
  });

  describe('injury-time stoppage (RFC injury-time-2026)', () => {
    // The engine now:
    //   1. Runs the regulation half (1-45 for 1H, 46-90 for 2H).
    //   2. Counts per-half fouls / yellows / reds / injuries.
    //   3. Calls `computeInjuryTime` to derive 0-5 stoppage minutes.
    //   4. Runs the stoppage minutes with no key moments and a
    //      dampened (4%) per-minute foul probability.
    //   5. Emits the half_time / full_time whistle at the
    //      stoppage-inclusive in-game minute, with the
    //      `injuryTime` value surfaced in the data payload.
    //
    // These specs pin the wire shape (event types, minute labels,
    // data.injuryTime, exposed engine fields). The formula itself
    // is a `MatchEngine.computeInjuryTime` unit spec below.

    it('exposes firstHalfInjuryTime / secondHalfInjuryTime on the engine after simulateMatch', () => {
      engine.simulateMatch();
      expect(engine.firstHalfInjuryTime).toBeGreaterThanOrEqual(0);
      expect(engine.firstHalfInjuryTime).toBeLessThanOrEqual(5);
      expect(engine.secondHalfInjuryTime).toBeGreaterThanOrEqual(0);
      expect(engine.secondHalfInjuryTime).toBeLessThanOrEqual(5);
    });

    it('emits half_time at minute (45 + firstHalfInjuryTime) with injuryTime in data', () => {
      engine.simulateMatch();
      const events = (engine as any).events as MatchEvent[];
      const halfTimeEvent = events.find((e) => e.type === 'half_time');
      expect(halfTimeEvent).toBeDefined();
      expect(halfTimeEvent!.minute).toBe(45 + engine.firstHalfInjuryTime);
      expect(halfTimeEvent!.data?.injuryTime).toBe(
        engine.firstHalfInjuryTime,
      );
      expect(halfTimeEvent!.data?.period).toBe('half_time');
    });

    it('emits full_time at minute (90 + secondHalfInjuryTime) with injuryTime in data', () => {
      engine.simulateMatch();
      const events = (engine as any).events as MatchEvent[];
      const fullTimeEvent = events.find((e) => e.type === 'full_time');
      expect(fullTimeEvent).toBeDefined();
      expect(fullTimeEvent!.minute).toBe(90 + engine.secondHalfInjuryTime);
      expect(fullTimeEvent!.data?.injuryTime).toBe(
        engine.secondHalfInjuryTime,
      );
    });

    it('plays the computed injury minutes when stoppage > 0 (events land in the stoppage window)', () => {
      // Run a small batch and look for a match with non-zero 1H
      // stoppage so we can assert that events with minute in the
      // 46..(45+N) window actually exist. With ~12% fouls/min and
      // 1-3 injuries typical for an 80-OVR match, ~30-50% of runs
      // produce N > 0. We bound the retry to keep CI deterministic
      // without adding a long timeout.
      //
      // We include `minute === 45 + N` in the window because for
      // N=1 the only stoppage event is the snapshot at minute 46
      // (the open interval (45, 46) has no integers). Excluding
      // the half_time whistle itself keeps the test about
      // "minutes were simulated", not "boundary events exist".
      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        const trial = new MatchEngine(homeTeam, awayTeam);
        trial.simulateMatch();
        if (trial.firstHalfInjuryTime > 0) {
          const events = (trial as any).events as MatchEvent[];
          const stoppageEvents = events.filter(
            (e) =>
              e.minute > 45 &&
              e.minute <= 45 + trial.firstHalfInjuryTime &&
              e.type !== 'half_time',
          );
          // Engine always emits at least the 46th-minute snapshot
          // when N>=1, so we should see ≥ 1 event in the window.
          expect(stoppageEvents.length).toBeGreaterThan(0);
          found = true;
        }
      }
      // If we never saw N > 0 in 20 runs the test still passes —
      // it just means the random distribution favored clean halves.
      // The other 3 specs above cover the 0-stoppage case.
    });

    it('computeInjuryTime caps at 5 and floors at 0 across synthetic stat sets', () => {
      // Pin a few representative cases so a future refactor can't
      // silently change the formula. The formula is:
      //   min(5, injuries + reds + floor(yellows/2) + floor(fouls/6))
      const calc = (s: {
        fouls: number;
        yellowCards: number;
        redCards: number;
        injuries: number;
      }) =>
        (MatchEngine as any)['computeInjuryTime'](s) as number;

      // Empty half → 0 (the user-requested minimum).
      expect(calc({ fouls: 0, yellowCards: 0, redCards: 0, injuries: 0 })).toBe(
        0,
      );
      // One injury alone → 1.
      expect(calc({ fouls: 0, yellowCards: 0, redCards: 0, injuries: 1 })).toBe(
        1,
      );
      // Six fouls (no cards, no injuries) → 1 (the floor(fouls/6) term).
      expect(calc({ fouls: 6, yellowCards: 0, redCards: 0, injuries: 0 })).toBe(
        1,
      );
      // Five fouls (under the threshold) → 0.
      expect(calc({ fouls: 5, yellowCards: 0, redCards: 0, injuries: 0 })).toBe(
        0,
      );
      // Two yellows (1 + 1 from floor(2/2)) → 1.
      expect(calc({ fouls: 0, yellowCards: 2, redCards: 0, injuries: 0 })).toBe(
        1,
      );
      // Wild half (2 inj + 1 red + 4 yellows + 18 fouls = 8) → cap 5.
      expect(
        calc({ fouls: 18, yellowCards: 4, redCards: 1, injuries: 2 }),
      ).toBe(5);
    });
  });

  describe('score ↔ goal event count sync (regression for set-piece score scan)', () => {
    // [Bug fix 2026-08-19] When `simulateMinute` was extracted from
    // `simulateMatch` in 603b5b2, the score scan that 30099d5 had moved
    // to the END of the minute (so set-piece goals from the per-minute
    // foul path could be counted) was accidentally re-inlined INSIDE
    // the `if (momentTimes.has(t))` block. Net effect: every goal
    // event the set-piece resolvers (corner / direct FK / indirect FK
    // / penalty) pushed into `this.events` was lost to the score —
    // `match.home_score` / `match.away_score` ended up strictly
    // lower than the event log's goal count. The two live matches on
    // 2026-08-19 (2862cefd, ef4aa90a) both had exactly one missed
    // set-piece goal each (final score 0-4 vs 1-4 events on home
    // side, 3-1 vs 4-1 events on home side).
    //
    // The structural fix moves the score scan back to minute level
    // (after both the key-moment and the per-minute foul have run).
    // This spec pins the invariant the fix preserves: the engine's
    // exposed `homeScore + awayScore` MUST equal the count of
    // `type === 'goal'` events in the event log, every time. We
    // retry up to 20 times so a fluke pass (e.g. match with zero
    // set-piece goals) doesn't false-positive the regression, and
    // we tolerate the 0-0 case via a fresh-engine fallback.
    it('homeScore + awayScore === count(goal events) for every simulateMatch() run', () => {
      for (let i = 0; i < 20; i++) {
        const trial = new MatchEngine(homeTeam, awayTeam);
        trial.simulateMatch();
        const events = (trial as any).events as MatchEvent[];
        const goalCount = events.filter((e) => e.type === 'goal').length;
        const runningTotal = trial.homeScore + trial.awayScore;
        if (goalCount === 0) continue; // 0-0 match → trivially equal, retry
        expect(runningTotal).toBe(goalCount);
        return; // one solid pass is enough
      }
      // If we hit 20 zero-goal matches in a row (vanishingly
      // unlikely at the configured OVRs), fail loudly so the
      // spec doesn't silently pass.
      throw new Error(
        'Could not find a match with goals in 20 runs — check test setup.',
      );
    });

    it('per-side score matches per-side goal events (set-piece goals attributed to the attacking team)', () => {
      // Tighter per-side check: homeScore must equal home-team goal
      // events, awayScore must equal away-team goal events. Catches
      // a one-sided scan where e.g. only the home side is missing.
      for (let i = 0; i < 20; i++) {
        const trial = new MatchEngine(homeTeam, awayTeam);
        trial.simulateMatch();
        const events = (trial as any).events as MatchEvent[];
        const homeGoals = events.filter(
          (e) => e.type === 'goal' && e.teamName === 'HomeFC',
        ).length;
        const awayGoals = events.filter(
          (e) => e.type === 'goal' && e.teamName === 'AwayFC',
        ).length;
        if (homeGoals + awayGoals === 0) continue;
        expect(trial.homeScore).toBe(homeGoals);
        expect(trial.awayScore).toBe(awayGoals);
        return;
      }
      throw new Error(
        'Could not find a match with goals in 20 runs — check test setup.',
      );
    });
  });

  describe('second_half kickoff wire shape (regression for processor 1-min drift)', () => {
    // The processor's `isSecondHalfKickoff` predicate in
    // `simulation.processor.ts` keys on:
    //   minute === 46 && type === 'second_half' && data.period === 'second_half'
    // to map the second-half kickoff to real time 60 (45 + 15 HT).
    // If the engine ever changes this wire shape the processor
    // silently regresses to the `eventMinute <= 90` arm (61 min
    // instead of 60). Pin the shape so a future refactor can't
    // break the contract without a test failure here.
    it('emits second_half kickoff at minute 46 with data.period === "second_half"', () => {
      engine.simulateMatch();
      const events = (engine as any).events as MatchEvent[];
      const secondHalfKickoff = events.find(
        (e) => e.type === 'second_half',
      );
      expect(secondHalfKickoff).toBeDefined();
      expect(secondHalfKickoff!.minute).toBe(46);
      expect(secondHalfKickoff!.data?.period).toBe('second_half');
    });
  });

  describe('second yellow → red card dismissal', () => {
    // Pre-fix the 2nd-yellow branch in `resolveFoul` called
    // `foulingTeam.sendOffPlayer(p.id)` but forgot
    // `player.isSentOff = true` (the direct-red-card branch
    // correctly sets both). The result: `player.isSentOff` stayed
    // `false` after a 2nd-yellow dismissal, so the player could
    // still be picked for subsequent fouls, injuries, or the
    // penalty shootout kicker filter, and `getPlayerEnergy` /
    // `pushDuelAttacker` pickers never excluded them.
    //
    // The fix is the one-line `player.isSentOff = true` in the
    // 2nd-yellow branch. We drive the branch deterministically by
    // mocking `Math.random` to: (a) select the home team,
    // (b) bypass the foulRateMultiplier gate, (c) pick the
    // 2nd-yellow player index, (d) land the roll in the yellow
    // range.
    it('sets player.isSentOff = true on a 2nd-yellow dismissal', () => {
      const targetIdx = 1; // non-GK home player
      const target = homeTeam.players[targetIdx];
      // `yellowCards` lives on the `TacticalPlayer` wrapper
      // (`simulation.types.ts:64`), not on the inner `Player`
      // object. Pre-seed 1 yellow so the next yellow is the 2nd.
      target.yellowCards = 1;

      // Mock Math.random in a fixed sequence for `resolveFoul`:
      //   1. foulingTeam pick: < 0.5 → home
      //   2. playerIdx pick: targetIdx / 11 → 1
      //   3. roll: 0.1 → in the yellow range (0.002..0.2)
      const seq = [0.1, targetIdx / 11, 0.1];
      let i = 0;
      const spy = jest
        .spyOn(Math, 'random')
        .mockImplementation(() => seq[i++ % seq.length]);

      try {
        (engine as any).resolveFoul();

        // The target player should now be sent off.
        expect(target.isSentOff).toBe(true);
        // Sanity: a red_card event was emitted for this player.
        const events = (engine as any).events as MatchEvent[];
        const redCard = events.find(
          (e) => e.type === 'red_card' && e.playerId === target.player.id,
        );
        expect(redCard).toBeDefined();
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('Player Match Stats', () => {
    it('should track player stats after match simulation', () => {
      engine.simulateMatch();

      const playerStats = (engine as any).getPlayerMatchStats();
      expect(playerStats).toBeDefined();
      expect(Array.isArray(playerStats)).toBe(true);

      // All players should have zeroed stats initially
      for (const stat of playerStats) {
        expect(stat.goals).toBeGreaterThanOrEqual(0);
        expect(stat.assists).toBeGreaterThanOrEqual(0);
        expect(stat.tackles).toBeGreaterThanOrEqual(0);
        expect(stat.minutesPlayed).toBeGreaterThanOrEqual(0);
      }
    });

    it('should track minutes played correctly', () => {
      engine.simulateMatch();

      const playerStats = (engine as any).getPlayerMatchStats();

      // Starting players should have played some minutes
      for (const stat of playerStats) {
        if (stat.appearances > 0) {
          expect(stat.minutesPlayed).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('shots / saves per-player accounting', () => {
    // The engine tracks two new per-player counters: `shots` and
    // `saves`. These are surfaced via `getPlayerMatchStats()` and
    // are read by the simulator's `updatePlayerCompetitionStats`
    // to populate `PlayerCompetitionStatsEntity.{shots, saves}`.
    //
    // The exact 1-to-1 mapping between engine events and the
    // internal counter is a stochastic property of the engine
    // (shot.shooter resolution + finalResult routing) and is
    // already exercised by the engine's own suite. This spec
    // just pins the SHAPE of the public surface: every player
    // row carries both fields, both are non-negative, and the
    // GK-only invariant on `saves` is preserved.
    it('getPlayerMatchStats rows expose shots and saves as non-negative numbers', () => {
      engine.simulateMatch();
      const playerStats = (engine as any).getPlayerMatchStats();
      expect(playerStats.length).toBeGreaterThan(0);
      for (const stat of playerStats) {
        expect(typeof stat.shots).toBe('number');
        expect(typeof stat.saves).toBe('number');
        expect(stat.shots).toBeGreaterThanOrEqual(0);
        expect(stat.saves).toBeGreaterThanOrEqual(0);
      }
    });

    it('saves are only credited to GKs (engine never writes saves to outfield players)', () => {
      engine.simulateMatch();
      const playerStats = (engine as any).getPlayerMatchStats();
      for (const stat of playerStats) {
        if (stat.saves > 0) {
          // The engine routes saves through
          // `defendingTeam.getGoalkeeper()`. Even if the starter
          // GK was sent off and an outfield player filled in,
          // the test team's `getGoalkeeper()` only ever returns
          // someone whose `positionKey` is 'GK' (the team's
          // starting GK). So saves should only ever appear on
          // a player whose position is the GK position.
          expect(stat.position).toBe('GK');
        }
      }
    });

    it('source: engine credits shooter.shots on every shot attempt, GK.saves on every save', () => {
      // Tripwire. The two writes are the load-bearing lines for
      // the new per-player columns. If either is removed or
      // misrouted (e.g. to the wrong variable), the production
      // data drops to zero and the FE-rendered shots/saves
      // column silently goes blank. This test catches a
      // regression immediately.
      const fs = require('fs');
      const path = require('path');
      const src = fs.readFileSync(
        path.join(__dirname, 'match.engine.ts'),
        'utf8',
      );
      // Both writes live in the per-shot tracking block in
      // `recordAttackSequence`. The exact identifier is
      // `shooterStats.shots++` and `gkStats.saves++` - the only
      // two places those counters are bumped.
      expect(src).toMatch(/shooterStats\.shots\+\+/);
      expect(src).toMatch(/gkStats\.saves\+\+/);
    });
  });

  describe('Lane Strength Averages', () => {
    it('should calculate lane strength averages', () => {
      engine.simulateMatch();

      const averages = (engine as any).getLaneStrengthAverages();

      expect(averages.home).toBeDefined();
      expect(averages.away).toBeDefined();

      // Check structure
      for (const side of ['home', 'away'] as const) {
        for (const lane of ['left', 'center', 'right'] as const) {
          expect(averages[side][lane].attack).toBeGreaterThan(0);
          expect(averages[side][lane].defense).toBeGreaterThan(0);
          expect(averages[side][lane].possession).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Match Report', () => {
    it('should generate complete match report', () => {
      engine.simulateMatch();

      const report = (engine as any).getMatchReport();

      expect(report.matchInfo).toBeDefined();
      expect(report.matchInfo.homeTeam).toBe('HomeFC');
      expect(report.matchInfo.awayTeam).toBe('AwayFC');

      expect(report.playerStats).toBeDefined();
      expect(Array.isArray(report.playerStats)).toBe(true);

      expect(report.laneStrengthAverages).toBeDefined();
      expect(report.matchStats).toBeDefined();

      expect(report.matchStats.summary.homeScore).toBeGreaterThanOrEqual(0);
      expect(report.matchStats.summary.awayScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Star Rating Calculation', () => {
    it('should show different stars for different OVR levels', () => {
      // Create team with varied OVR players
      const createPlayer = (id: number, name: string, ovr: number): Player => ({
        id,
        name,
        position: 'CM',
        exactAge: [25, 0],
        attributes: {
          finishing: ovr,
          composure: ovr,
          positioning: ovr,
          strength: ovr,
          pace: ovr,
          dribbling: ovr,
          passing: ovr,
          defending: ovr,
          freeKicks: 50,
          penalties: 50,
          gk_reflexes: 50,
          gk_handling: 50,
          gk_aerial: 50,
        },
        currentStamina: 3,
        form: 5, // Max form
        experience: 10,
      });

      const homeTeam = new Team('HomeFC', [
        {
          player: createPlayer(1, 'World Class CM', 18),
          positionKey: 'CM',
        },
        {
          player: createPlayer(2, 'Good CM', 14),
          positionKey: 'CM',
        },
        {
          player: createPlayer(3, 'Average CM', 10),
          positionKey: 'CM',
        },
        {
          player: createPlayer(4, 'Weak CM', 6),
          positionKey: 'CM',
        },
      ]);

      const awayTeam = new Team('AwayFC', [
        {
          player: createPlayer(5, 'Away World Class', 18),
          positionKey: 'CM',
        },
      ]);

      const testEngine = new MatchEngine(homeTeam, awayTeam);
      testEngine.simulateMatch();

      const report = (testEngine as any).getPlayerMatchStats();

      console.log('\n=== Star Rating by OVR Level ===');
      for (const stat of report) {
        console.log(
          `${stat.playerName} (${stat.position}): avgStars=${stat.avgStars}, avgContribution=${stat.avgContribution}, minutes=${stat.minutesPlayed}`,
        );
      }

      // Verify higher OVR has higher stars
      const worldClass = report.find(
        (s: any) => s.playerName === 'World Class CM',
      );
      const average = report.find((s: any) => s.playerName === 'Average CM');
      const weak = report.find((s: any) => s.playerName === 'Weak CM');

      expect(worldClass?.avgStars).toBeGreaterThan(average?.avgStars ?? 0);
      expect(average?.avgStars).toBeGreaterThan(weak?.avgStars ?? 0);

      // World class should be 16+ power rating
      // Threshold lowered from 16 -> 15 after the exp-factor formula change
// (K=6, cap=0.21 -> K=100, base=0.03, cap=0.25). The test players only
// have 10 XP (L1), so the L1 exp bonus dropped from +13% to +5%; World
// Class avgStars fell from ~16+ to 15.29. Real regression check, not
// a tautology. The other thresholds (Average 6-14, Weak 2-8) still
// hold because the spread is dominated by skill differences, not exp.
expect(worldClass?.avgStars).toBeGreaterThanOrEqual(15);
      // Average should be 6–14 power rating
      expect(average?.avgStars).toBeGreaterThanOrEqual(6);
      expect(average?.avgStars).toBeLessThan(14);
      // Weak should be 2–8 power rating
      expect(weak?.avgStars).toBeGreaterThanOrEqual(2);
      expect(weak?.avgStars).toBeLessThan(8);
    });

    it('should show different stars for different positions', () => {
      const createPlayer = (
        id: number,
        name: string,
        position: string,
        ovr: number,
      ): Player => ({
        id,
        name,
        position,
        exactAge: [25, 0],
        attributes: {
          finishing: position.includes('F') ? ovr : 10,
          composure: ovr,
          positioning: ovr,
          strength: ovr,
          pace: ovr,
          dribbling: position.includes('W') ? ovr : 10,
          passing: ovr,
          defending:
            position.includes('D') || position.includes('B') ? ovr : 10,
          freeKicks: 50,
          penalties: 50,
          gk_reflexes: position === 'GK' ? ovr : 50,
          gk_handling: position === 'GK' ? ovr : 50,
          gk_aerial: position === 'GK' ? ovr : 50,
        },
        currentStamina: 3,
        form: 5,
        experience: 10,
      });

      const homeTeam = new Team('PositionTest', [
        {
          player: createPlayer(1, 'CF', 'CF', 15),
          positionKey: 'CF',
        },
        {
          player: createPlayer(2, 'CM', 'CM', 15),
          positionKey: 'CM',
        },
        {
          player: createPlayer(3, 'CB', 'CB', 15),
          positionKey: 'CB',
        },
        {
          player: createPlayer(4, 'LB', 'LB', 15),
          positionKey: 'LB',
        },
        {
          player: createPlayer(5, 'GK', 'GK', 15),
          positionKey: 'GK',
        },
      ]);

      const awayTeam = new Team('AwayTeam', [
        {
          player: createPlayer(99, 'Away', 'CM', 15),
          positionKey: 'CM',
        },
      ]);

      const testEngine = new MatchEngine(homeTeam, awayTeam);
      testEngine.simulateMatch();

      const report = (testEngine as any).getPlayerMatchStats();

      console.log('\n=== Star Rating by Position (Skill 15) ===');
      for (const stat of report) {
        console.log(
          `${stat.playerName} (${stat.position}): avgStars=${stat.avgStars}, avgContribution=${stat.avgContribution}`,
        );
      }
    });
  });

  describe('Tactical Dimensions', () => {
    // Attributes are 0-20 range
    const createPlayer = (id: number, ovr: number): Player => ({
      id,
      name: `Player ${id}`,
      position: 'CM',
      exactAge: [25, 0],
      attributes: {
        finishing: ovr,
        composure: ovr,
        positioning: ovr,
        strength: ovr,
        pace: ovr,
        dribbling: ovr,
        passing: ovr,
        defending: ovr,
        freeKicks: 15,
        penalties: 15,
        gk_reflexes: 15,
        gk_handling: 15,
        gk_aerial: 15,
      },
      currentStamina: 3,
      form: 5,
      experience: 10,
    });

    const createTeam = (name: string, ovr: number): Team => {
      const players: TacticalPlayer[] = [];
      for (let i = 0; i < 11; i++) {
        players.push({
          player: createPlayer(i, ovr),
          positionKey: i === 0 ? 'GK' : 'CM',
        });
      }
      return new Team(name, players);
    };

    it('should accept tactics config via constructor', () => {
      const home = createTeam('Home', 16);
      const away = createTeam('Away', 16);
      const {
        Tempo,
        PitchWidth,
        DefensiveLine,
      } = require('./types/tactics-config');
      const engine = new MatchEngine(
        home,
        away,
        [],
        [],
        new Map(),
        null,
        null,
        'cloudy',
        {
          tempo: Tempo.FAST,
          pitchWidth: PitchWidth.WIDE,
          defensiveLine: DefensiveLine.HIGH,
        },
        {
          tempo: Tempo.SLOW,
          pitchWidth: PitchWidth.NARROW,
          defensiveLine: DefensiveLine.LOW,
        },
      );

      expect(engine.homeTeam).toBeDefined();
      expect(engine.awayTeam).toBeDefined();
    });

    it('should use BALANCED tactics by default when none provided', () => {
      const home = createTeam('Home', 15);
      const away = createTeam('Away', 15);
      const engine = new MatchEngine(home, away);

      // Should simulate without error using default tactics
      const events = engine.simulateMatch();
      expect(events.length).toBeGreaterThan(0);
    });

    it('should generate events with different tempos producing different duel outcomes', () => {
      const home = createTeam('Home', 16);
      const away = createTeam('Away', 16);
      const {
        Tempo,
        PitchWidth,
        DefensiveLine,
      } = require('./types/tactics-config');

      // Run multiple times with FAST tempo to observe higher variance
      const fastEngine = new MatchEngine(
        home,
        away,
        [],
        [],
        new Map(),
        null,
        null,
        'cloudy',
        {
          tempo: Tempo.FAST,
          pitchWidth: PitchWidth.BALANCED,
          defensiveLine: DefensiveLine.MID,
        },
        {
          tempo: Tempo.SLOW,
          pitchWidth: PitchWidth.BALANCED,
          defensiveLine: DefensiveLine.MID,
        },
      );

      const fastEvents = fastEngine.simulateMatch();
      expect(fastEvents.length).toBeGreaterThan(0);
    });

    it('should produce valid match events with all tactic combinations', () => {
      const {
        Tempo,
        PitchWidth,
        DefensiveLine,
      } = require('./types/tactics-config');

      const combinations = [
        {
          tempo: Tempo.SLOW,
          pitchWidth: PitchWidth.NARROW,
          defensiveLine: DefensiveLine.LOW,
        },
        {
          tempo: Tempo.BALANCED,
          pitchWidth: PitchWidth.BALANCED,
          defensiveLine: DefensiveLine.MID,
        },
        {
          tempo: Tempo.FAST,
          pitchWidth: PitchWidth.WIDE,
          defensiveLine: DefensiveLine.HIGH,
        },
        {
          tempo: Tempo.FAST,
          pitchWidth: PitchWidth.NARROW,
          defensiveLine: DefensiveLine.HIGH,
        },
        {
          tempo: Tempo.SLOW,
          pitchWidth: PitchWidth.WIDE,
          defensiveLine: DefensiveLine.LOW,
        },
      ];

      for (const tactics of combinations) {
        const home = createTeam('Home', 75);
        const away = createTeam('Away', 75);
        const engine = new MatchEngine(
          home,
          away,
          [],
          [],
          new Map(),
          null,
          null,
          'cloudy',
          tactics,
          tactics,
        );

        const events = engine.simulateMatch();
        expect(events.length).toBeGreaterThan(0);

        const kickoff = events.find((e: any) => e.type === 'kickoff');
        expect(kickoff).toBeDefined();
      }
    });
  });
});

// ============================================================================
// End-to-end: swap + move instructions are recognised by the engine
// and gated by the EventCondition (only / always / leading / etc.).
// ============================================================================

describe('MatchEngine.applyInstructionsForTeam — move & swap plumbing', () => {
  // Full-shape mock player — AttributeCalculator.preCachePlayerContributions
  // (called from Team.movePlayer) reads `attributes.{finishing,pace,…}` so
  // a partial mock triggers TypeError on every move.
  const mkPlayer = (id: number, pos: string): Player => ({
    id,
    name: `Player ${id}`,
    position: pos,
    exactAge: [25, 0],
    attributes: {
      finishing: 60,
      composure: 60,
      positioning: 60,
      strength: 60,
      pace: 60,
      dribbling: 60,
      passing: 60,
      defending: 60,
      freeKicks: 50,
      penalties: 50,
      gk_reflexes: 50,
      gk_handling: 50,
      gk_aerial: 50,
    },
    currentStamina: 3,
    form: 5,
    experience: 10,
  });

  const mkTeam = () => {
    const players: TacticalPlayer[] = [
      { player: mkPlayer(1, 'CM'), positionKey: 'CML' },
      { player: mkPlayer(2, 'GK'), positionKey: 'GK' },
      { player: mkPlayer(3, 'CM'), positionKey: 'CMC' },
      { player: mkPlayer(4, 'CF'), positionKey: 'CF' },
    ];
    return new Team('Test', players);
  };

  it('runs a move at the scheduled minute regardless of score', () => {
    const team = mkTeam();
    const engine = new MatchEngine(
      team,
      mkTeam(),
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
    );
    (engine as any).homeInstructions = [
      { minute: 70, type: 'move', playerId: 1, newPosition: 'CMR' },
    ];
    (engine as any).applyInstructionsForTeam(
      team,
      (engine as any).homeInstructions,
      70,
      'draw',
    );
    const moved = team.players.find((p: TacticalPlayer) => p.player.id === 1);
    expect(moved?.positionKey).toBe('CMR');
  });

  it('treats undefined condition as "always"', () => {
    const team = mkTeam();
    const engine = new MatchEngine(
      team,
      mkTeam(),
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
    );
    (engine as any).homeInstructions = [
      { minute: 60, type: 'move', playerId: 1, newPosition: 'CMR' },
    ];
    for (const status of ['leading', 'draw', 'trailing'] as const) {
      const p = team.players.find((tp: TacticalPlayer) => tp.player.id === 1);
      if (p) p.positionKey = 'CML';
      (engine as any).applyInstructionsForTeam(
        team,
        (engine as any).homeInstructions,
        60,
        status,
      );
      const moved = team.players.find(
        (tp: TacticalPlayer) => tp.player.id === 1,
      );
      expect(moved?.positionKey).toBe('CMR');
    }
  });

  it('skips a move when condition is leading but score is trailing', () => {
    const team = mkTeam();
    const engine = new MatchEngine(
      team,
      mkTeam(),
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
    );
    (engine as any).homeInstructions = [
      {
        minute: 60,
        type: 'move',
        playerId: 1,
        newPosition: 'CMR',
        condition: 'leading',
      },
    ];
    (engine as any).applyInstructionsForTeam(
      team,
      (engine as any).homeInstructions,
      60,
      'trailing',
    );
    const moved = team.players.find((p: TacticalPlayer) => p.player.id === 1);
    expect(moved?.positionKey).toBe('CML'); // unchanged — move gated out
  });

  it('fires a move when condition is leading AND score is leading', () => {
    const team = mkTeam();
    const engine = new MatchEngine(
      team,
      mkTeam(),
      [],
      [],
      new Map(),
      null,
      null,
      'cloudy',
    );
    (engine as any).homeInstructions = [
      {
        minute: 60,
        type: 'move',
        playerId: 1,
        newPosition: 'CMR',
        condition: 'leading',
      },
    ];
    (engine as any).applyInstructionsForTeam(
      team,
      (engine as any).homeInstructions,
      60,
      'leading',
    );
    const moved = team.players.find((p: TacticalPlayer) => p.player.id === 1);
    expect(moved?.positionKey).toBe('CMR');
  });
});

// ============================================================================
// EventCondition — shouldFire() gating
// ============================================================================

describe('MatchEngine.shouldFire — condition gating', () => {
  const createMockPlayer = (id: number): Player => ({
    id,
    name: `Player ${id}`,
    position: 'CM',
    exactAge: [25, 0],
    attributes: {
      finishing: 50,
      composure: 50,
      positioning: 50,
      strength: 50,
      pace: 50,
      dribbling: 50,
      passing: 50,
      defending: 50,
      freeKicks: 50,
      penalties: 50,
      gk_reflexes: 50,
      gk_handling: 50,
      gk_aerial: 50,
    },
    currentStamina: 3,
    form: 5,
    experience: 10,
  });

  const createTeam = (name: string): Team => {
    const players: TacticalPlayer[] = Array.from({ length: 11 }, (_, i) => ({
      player: createMockPlayer(i),
      positionKey: i === 0 ? 'GK' : 'CM',
    }));
    return new Team(name, players);
  };

  // Reach the private `shouldFire` for a focused unit test.
  const shouldFire = (
    condition: any,
    status: 'leading' | 'draw' | 'trailing',
  ) => {
    const engine = new MatchEngine(createTeam('Home'), createTeam('Away'));
    return (engine as any).shouldFire(condition, status);
  };

  it('treats undefined condition as always', () => {
    expect(shouldFire(undefined, 'leading')).toBe(true);
    expect(shouldFire(undefined, 'trailing')).toBe(true);
    expect(shouldFire(undefined, 'draw')).toBe(true);
  });

  it('always fires when condition is "always"', () => {
    expect(shouldFire('always', 'leading')).toBe(true);
    expect(shouldFire('always', 'trailing')).toBe(true);
    expect(shouldFire('always', 'draw')).toBe(true);
  });

  it('fires only on the matching single-status condition', () => {
    expect(shouldFire('leading', 'leading')).toBe(true);
    expect(shouldFire('leading', 'trailing')).toBe(false);
    expect(shouldFire('leading', 'draw')).toBe(false);

    expect(shouldFire('trailing', 'trailing')).toBe(true);
    expect(shouldFire('trailing', 'leading')).toBe(false);
    expect(shouldFire('trailing', 'draw')).toBe(false);

    // `tied` is the frontend spelling of the simulator's `draw`.
    expect(shouldFire('tied', 'draw')).toBe(true);
    expect(shouldFire('tied', 'leading')).toBe(false);
    expect(shouldFire('tied', 'trailing')).toBe(false);
  });

  it('fires "notLeading" when the team is NOT ahead', () => {
    expect(shouldFire('notLeading', 'leading')).toBe(false);
    expect(shouldFire('notLeading', 'trailing')).toBe(true);
    expect(shouldFire('notLeading', 'draw')).toBe(true);
  });

  it('fires "notTrailing" when the team is NOT behind', () => {
    expect(shouldFire('notTrailing', 'leading')).toBe(true);
    expect(shouldFire('notTrailing', 'trailing')).toBe(false);
    expect(shouldFire('notTrailing', 'draw')).toBe(true);
  });

  it('falls back to firing for unknown conditions (forward compatibility)', () => {
    expect(shouldFire('someFutureCondition', 'leading')).toBe(true);
    expect(shouldFire('someFutureCondition', 'draw')).toBe(true);
  });
});
