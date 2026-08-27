import { SimulationProcessor } from './simulation.processor';
import type { MatchEvent } from '../engine/match.engine';
import { GAME_SETTINGS } from '@goalxi/database';

/**
 * [RFC injury-time-2026] Verification spec for
 * `SimulationProcessor.computeEventRealTimeMs`.
 *
 * The function maps an in-game event minute to a real-world ms
 * offset from `match.scheduledAt`. It has to thread the cumulative
 * stoppage through the break boundary correctly:
 *
 *   - 1H stoppage (N1) sits BEFORE the HT break, so it does NOT
 *     shift any 2H event.
 *   - ET 1H stoppage (N2) sits BEFORE the ET break, so it DOES
 *     shift every ET 2H event (kickoff + regulation + injury + FT)
 *     by +N2 real minutes.
 *   - ET 2H stoppage (M2) sits at the end of ET 2H, so it only
 *     affects the FT whistle's real time.
 *
 * The function takes a `phase` parameter that the for-loop
 * computes from the event stream (a `half_time` event flips
 * pre_1h → post_1h; an ET `kickoff` flips post_1h → pre_et1;
 * another `half_time` flips pre_et1 → post_et1). The phase
 * is required because events in different phases can share the
 * same in-game minute label (e.g. 1H injury at minute 46 vs 2H
 * regulation at minute 46; ET 1H injury at minute 106 vs ET 2H
 * regulation at minute 106).
 *
 * The table-driven test cases below cover every event type the
 * engine emits for the canonical scenarios:
 *
 *   - no stoppage (N1=N2=M=M2=0)
 *   - first-half stoppage only (N1=3)
 *   - second-half stoppage only (M=3)
 *   - both halves have stoppage (N1=2, M=2)
 *   - ET first-half stoppage (N2=3)
 *   - ET both halves with stoppage (N1=2, N2=3, M=2, M2=4)
 */
describe('SimulationProcessor.computeEventRealTimeMs (timeline mapping)', () => {
  const HT = GAME_SETTINGS.MATCH_HALF_TIME_MINUTES; // 15
  const ET_BREAK = GAME_SETTINGS.MATCH_EXTRA_TIME_BREAK_MINUTES; // 5
  const MIN = 60 * 1000;

  type Phase = 'pre_1h' | 'post_1h' | 'pre_et1' | 'post_et1';

  type Ctx = {
    hasExtraTime: boolean;
    firstHalfInjuryTime: number;
    secondHalfInjuryTime: number;
    extraTimeFirstHalfInjury: number;
    extraTimeSecondHalfInjury: number;
  };

  type Case = {
    label: string;
    event: Pick<MatchEvent, 'minute' | 'type' | 'data'>;
    phase: Phase;
    expectedMin: number;
  };

  const row = (
    label: string,
    minute: number,
    type: MatchEvent['type'],
    data: MatchEvent['data'],
    phase: Phase,
    expectedRealMin: number,
  ): Case => ({
    label,
    event: { minute, type, data },
    phase,
    expectedMin: expectedRealMin,
  });

  const assertAll = (cases: Case[], ctx: Ctx) => {
    for (const c of cases) {
      const offset = SimulationProcessor.computeEventRealTimeMs(
        c.event as MatchEvent,
        c.phase,
        ctx,
      );
      expect(offset / MIN).toBe(c.expectedMin);
    }
  };

  // Regular match, no stoppage, no ET.
  const regularNoStoppage: Case[] = [
    row('1H kickoff at minute 0', 0, 'kickoff', { period: 'first_half' }, 'pre_1h', 0),
    row('1H goal at minute 23', 23, 'goal', {}, 'pre_1h', 23),
    row('1H foul at minute 44', 44, 'foul', {}, 'pre_1h', 44),
    row('1H whistle at minute 45 (N1=0)', 45, 'half_time', { period: 'half_time' }, 'pre_1h', 45),
    row(
      '2H kickoff at minute 46 (second_half event)',
      46,
      'second_half',
      { period: 'second_half' },
      'pre_1h',
      45 + HT,
    ),
    row('2H goal at minute 47', 47, 'goal', {}, 'post_1h', 47 + HT),
    row('2H goal at minute 90', 90, 'goal', {}, 'post_1h', 90 + HT),
    row('FT whistle at minute 90 (M=0)', 90, 'full_time', {}, 'post_1h', 90 + HT),
  ];

  // Regular match with 1H (N1=3) and 2H (M=3) stoppage.
  const regularWithStoppage: Case[] = [
    // 1H injury window
    row('1H injury at minute 46 (N1=3)', 46, 'snapshot', {}, 'pre_1h', 46),
    row('1H injury at minute 47 (N1=3)', 47, 'snapshot', {}, 'pre_1h', 47),
    // 1H whistle with injury
    row(
      '1H whistle at minute 48 (N1=3)',
      48,
      'half_time',
      { period: 'half_time' },
      'pre_1h',
      48,
    ),
    // 2H regulation stays at minute+HT regardless of N1
    row('2H goal at minute 50 (N1=3)', 50, 'goal', {}, 'post_1h', 50 + HT),
    row('2H goal at minute 90 (N1=3)', 90, 'goal', {}, 'post_1h', 90 + HT),
    // 2H injury window
    row('2H injury at minute 91 (M=3)', 91, 'snapshot', {}, 'post_1h', 91 + HT),
    row('2H injury at minute 92 (M=3)', 92, 'snapshot', {}, 'post_1h', 92 + HT),
    // FT whistle with 2H injury
    row('FT whistle at minute 93 (M=3)', 93, 'full_time', {}, 'post_1h', 93 + HT),
  ];

  // ET match, no stoppage. The post_1h phase is where the ET
  // kickoff is processed (the for-loop flips to pre_et1 after).
  const etNoStoppage: Case[] = [
    row(
      'ET kickoff at minute 90 (period: extra_time) — emitted in post_1h',
      90,
      'kickoff',
      { period: 'extra_time' },
      'post_1h',
      90 + HT,
    ),
    // ET 1H regulation
    row('ET 1H goal at minute 91', 91, 'goal', {}, 'pre_et1', 90 + HT + 1),
    row('ET 1H goal at minute 104', 104, 'goal', {}, 'pre_et1', 90 + HT + 14),
    // ET 2H kickoff
    row(
      'ET 2H kickoff at minute 105 (period: extra_time_second_half)',
      105,
      'kickoff',
      { period: 'extra_time_second_half' },
      'post_et1',
      90 + HT + 15 + ET_BREAK,
    ),
    // ET 2H regulation
    row('ET 2H goal at minute 106', 106, 'goal', {}, 'post_et1', 90 + HT + 15 + ET_BREAK + 1),
    row(
      'ET 2H goal at minute 120 (M2=0)',
      120,
      'goal',
      {},
      'post_et1',
      90 + HT + 15 + ET_BREAK + 15,
    ),
    // ET FT whistle
    row(
      'ET FT whistle at minute 120 (M2=0)',
      120,
      'full_time',
      {},
      'post_et1',
      90 + HT + 15 + ET_BREAK + 15,
    ),
  ];

  // ET match with 1H stoppage (N2=3) — the load-bearing
  // N2-cascades-into-ET-2H invariant. Pre-fix the processor
  // dropped the N2 term from every ET 2H arm and put the kickoff
  // + every subsequent event `N2` minutes too early.
  const et1HInjury: Case[] = [
    // ET 1H regulation
    row('ET 1H goal at minute 91 (N2=3)', 91, 'goal', {}, 'pre_et1', 90 + HT + 1),
    row('ET 1H goal at minute 104 (N2=3)', 104, 'goal', {}, 'pre_et1', 90 + HT + 14),
    // ET 1H injury window (106..107, before the whistle)
    row('ET 1H injury at minute 106 (N2=3)', 106, 'snapshot', {}, 'pre_et1', 121),
    row('ET 1H injury at minute 107 (N2=3)', 107, 'snapshot', {}, 'pre_et1', 122),
    // ET 1H whistle
    row(
      'ET 1H whistle at minute 108 (N2=3) — was 108 pre-fix, should be 123',
      108,
      'half_time',
      { period: 'extra_time_half_time' },
      'pre_et1',
      123,
    ),
    // ET 2H kickoff
    row(
      'ET 2H kickoff at minute 105 with N2=3 — was 125 pre-fix, should be 128',
      105,
      'kickoff',
      { period: 'extra_time_second_half' },
      'post_et1',
      128,
    ),
    // ET 2H regulation
    row(
      'ET 2H event at minute 106 with N2=3 — was 126 pre-fix, should be 129',
      106,
      'goal',
      {},
      'post_et1',
      129,
    ),
    row(
      'ET 2H event at minute 120 with N2=3 (M2=0) — was 140 pre-fix, should be 143',
      120,
      'goal',
      {},
      'post_et1',
      143,
    ),
  ];

  // ET match with 2H stoppage (M2=3). M2 only affects the FT
  // whistle's real time; ET 2H regulation events use the same
  // formula so the M2 contribution flows through the (m-105)
  // offset automatically.
  const et2HInjury: Case[] = [
    row(
      'ET 2H injury at minute 121 with N2=0, M2=3',
      121,
      'snapshot',
      {},
      'post_et1',
      141,
    ),
    row(
      'ET FT whistle at minute 123 with N2=0, M2=3',
      123,
      'full_time',
      {},
      'post_et1',
      143,
    ),
  ];

  describe('regular match (no ET) — no stoppage', () => {
    it('all phase transitions map to the right real-time offset', () => {
      const ctx: Ctx = {
        hasExtraTime: false,
        firstHalfInjuryTime: 0,
        secondHalfInjuryTime: 0,
        extraTimeFirstHalfInjury: 0,
        extraTimeSecondHalfInjury: 0,
      };
      assertAll(regularNoStoppage, ctx);
    });
  });

  describe('regular match with 1H and 2H stoppage (N1=3, M=3)', () => {
    it('1H injury and 2H injury map correctly, 1H whistle moves with N1', () => {
      const ctx: Ctx = {
        hasExtraTime: false,
        firstHalfInjuryTime: 3,
        secondHalfInjuryTime: 3,
        extraTimeFirstHalfInjury: 0,
        extraTimeSecondHalfInjury: 0,
      };
      assertAll(regularWithStoppage, ctx);
    });
  });

  describe('ET match — no stoppage', () => {
    it('every event lands at the right real-time offset', () => {
      const ctx: Ctx = {
        hasExtraTime: true,
        firstHalfInjuryTime: 0,
        secondHalfInjuryTime: 0,
        extraTimeFirstHalfInjury: 0,
        extraTimeSecondHalfInjury: 0,
      };
      assertAll(etNoStoppage, ctx);
    });
  });

  describe('ET match with 1H stoppage (N2=3) — the N2-cascade regression suite', () => {
    // Pre-fix the processor's ET 2H arms computed real time as if
    // N2 = 0, putting the ET 2H kickoff, regulation, injury, and
    // FT whistle `N2` minutes too early whenever ET 1H had any
    // stoppage. The four rows in this block that pin 128 / 129 /
    // 145 are the regression suite for that bug.
    it('every event lands at the right real-time offset, with N2 cascading through ET 2H', () => {
      const ctx: Ctx = {
        hasExtraTime: true,
        firstHalfInjuryTime: 0,
        secondHalfInjuryTime: 0,
        extraTimeFirstHalfInjury: 3,
        extraTimeSecondHalfInjury: 0,
      };
      assertAll(et1HInjury, ctx);
    });
  });

  describe('ET match with 2H stoppage (M2=3)', () => {
    it('M2 only affects ET 2H injury + FT whistle, not ET 1H', () => {
      const ctx: Ctx = {
        hasExtraTime: true,
        firstHalfInjuryTime: 0,
        secondHalfInjuryTime: 0,
        extraTimeFirstHalfInjury: 0,
        extraTimeSecondHalfInjury: 3,
      };
      assertAll(et2HInjury, ctx);
    });
  });

  describe('sweep: 2H events stay at minute+HT regardless of N1', () => {
    // 1H whistle moves with N1, but 2H events don't — the HT
    // break is constant. We sweep N1 ∈ {0, 1, 3, 5} to pin this.
    for (const N1 of [0, 1, 3, 5]) {
      it(`N1=${N1}: 1H whistle real time = 45+N1, 2H events at minute+HT`, () => {
        const ctx: Ctx = {
          hasExtraTime: false,
          firstHalfInjuryTime: N1,
          secondHalfInjuryTime: 0,
          extraTimeFirstHalfInjury: 0,
          extraTimeSecondHalfInjury: 0,
        };

        const halfTime = SimulationProcessor.computeEventRealTimeMs(
          {
            minute: 45 + N1,
            // The 1H whistle is at in-game 45+N1'0" — engine
            // and in-game minute align for 1H. The processor's
            // `computeEventRealTimeMs` only reads `minute` and
            // `data.period`, so this is a no-op for the math
            // — it's required by the engine's `MatchEvent` type
            // after RFC clockSeconds-2026.
            clockSeconds: (45 + N1) * 60,
            type: 'half_time',
            data: { period: 'half_time' },
          } as MatchEvent,
          'pre_1h',
          ctx,
        );
        expect(halfTime / MIN).toBe(45 + N1);

        for (const m of [46, 50, 60, 75, 90]) {
          const offset = SimulationProcessor.computeEventRealTimeMs(
            {
              minute: m,
              // 2H events at engine `m` map to in-game
              // `(m-1)*60` per `engineMinuteToClockSeconds`.
              // Real-time scheduling doesn't read this; the
              // field is required by the engine's `MatchEvent`
              // type after RFC clockSeconds-2026.
              clockSeconds: (m - 1) * 60,
              type: 'goal',
              data: {},
            } as MatchEvent,
            'post_1h',
            ctx,
          );
          expect(offset / MIN).toBe(m + HT);
        }
      });
    }
  });

  describe('sweep: 2H injury real time = minute+HT, FT whistle at 105+M', () => {
    for (const M of [0, 1, 3, 5]) {
      it(`M=${M}: 2H injury stays at minute+HT, FT at minute 90+M real time 105+M`, () => {
        const ctx: Ctx = {
          hasExtraTime: false,
          firstHalfInjuryTime: 0,
          secondHalfInjuryTime: M,
          extraTimeFirstHalfInjury: 0,
          extraTimeSecondHalfInjury: 0,
        };

        for (const m of [91, 92, 93, 95]) {
          const offset = SimulationProcessor.computeEventRealTimeMs(
            // 2H injury ticks 91..90+M map to in-game
            // 90..(89+M) per `engineMinuteToClockSeconds`.
            // Field is required by the engine's `MatchEvent`
            // type after RFC clockSeconds-2026.
            { minute: m, clockSeconds: (m - 1) * 60, type: 'snapshot', data: {} } as MatchEvent,
            'post_1h',
            ctx,
          );
          expect(offset / MIN).toBe(m + HT);
        }

        const ft = SimulationProcessor.computeEventRealTimeMs(
          // 2H whistle is at in-game 90+M:00 (clockSeconds
          // (90+M)*60) — engine `minute` and in-game minute
          // happen to align for the whistle.
          { minute: 90 + M, clockSeconds: (90 + M) * 60, type: 'full_time', data: {} } as MatchEvent,
          'post_1h',
          ctx,
        );
        expect(ft / MIN).toBe(90 + M + HT);
      });
    }
  });

  describe('full integration: regular + 1H + 2H + ET1 + ET2 stoppage', () => {
    // The most aggressive scenario. Every stoppage type is
    // non-zero. Validates that the formulas compose cleanly and
    // don't double-count or skip the cascades.
    const N1 = 2;
    const M = 2;
    const N2 = 3;
    const M2 = 4;
    const ctx: Ctx = {
      hasExtraTime: true,
      firstHalfInjuryTime: N1,
      secondHalfInjuryTime: M,
      extraTimeFirstHalfInjury: N2,
      extraTimeSecondHalfInjury: M2,
    };

    it('FT whistle real time = 140+N2+M2', () => {
      const ft = SimulationProcessor.computeEventRealTimeMs(
        // ET 2H whistle is at in-game 120+M2:00 (engine and
        // in-game align for the whistle).
        { minute: 120 + M2, clockSeconds: (120 + M2) * 60, type: 'full_time', data: {} } as MatchEvent,
        'post_et1',
        ctx,
      );
      expect(ft / MIN).toBe(140 + N2 + M2); // 147
    });

    it('1H whistle real time = 45+N1 (no HT yet)', () => {
      const t = SimulationProcessor.computeEventRealTimeMs(
        {
          minute: 45 + N1,
          clockSeconds: (45 + N1) * 60,
          type: 'half_time',
          data: { period: 'half_time' },
        } as MatchEvent,
        'pre_1h',
        ctx,
      );
      expect(t / MIN).toBe(45 + N1); // 47
    });

    it('ET 1H whistle real time = 120+N2 (HT was before)', () => {
      const t = SimulationProcessor.computeEventRealTimeMs(
        {
          minute: 105 + N2,
          clockSeconds: (105 + N2) * 60,
          type: 'half_time',
          data: { period: 'extra_time_half_time' },
        } as MatchEvent,
        'pre_et1',
        ctx,
      );
      expect(t / MIN).toBe(120 + N2); // 123
    });

    it('2H kickoff real time = 60 (HT is constant, N1 does not shift)', () => {
      const t = SimulationProcessor.computeEventRealTimeMs(
        {
          // 2H kickoff is at engine `minute: 46` (legacy
          // wire shape) but in-game 45'0" (clockSeconds
          // 2700). Field is required by the engine's
          // `MatchEvent` type after RFC clockSeconds-2026.
          minute: 46,
          clockSeconds: 2700,
          type: 'second_half',
          data: { period: 'second_half' },
        } as MatchEvent,
        'pre_1h',
        ctx,
      );
      expect(t / MIN).toBe(45 + HT); // 60
    });

    it('2H FT whistle real time = 105+M (HT is constant, M only shifts 2H end)', () => {
      const t = SimulationProcessor.computeEventRealTimeMs(
        // 2H whistle is at in-game 90+M:00 (engine and
        // in-game align for the whistle).
        { minute: 90 + M, clockSeconds: (90 + M) * 60, type: 'full_time', data: {} } as MatchEvent,
        'post_1h',
        ctx,
      );
      expect(t / MIN).toBe(90 + M + HT); // 107
    });

    it('2H injury event lands at minute+HT even when ET is on (regression for branch routing)', () => {
      // Edge case: a 2H-injury event (minute 91..95) with
      // hasExtraTime=true. The function's post_1h arm returns
      // minute+HT regardless of hasExtraTime, so this still
      // routes correctly to the 2H-injury formula (NOT the ET
      // 2H regulation formula at 90+15+15+5+(m-105)).
      const t = SimulationProcessor.computeEventRealTimeMs(
        // 2H injury tick 91 is at in-game 90:00
        // (clockSeconds 5400) per `engineMinuteToClockSeconds`.
        { minute: 91, clockSeconds: 5400, type: 'snapshot', data: {} } as MatchEvent,
        'post_1h',
        ctx,
      );
      expect(t / MIN).toBe(91 + HT); // 106
    });
  });
});
