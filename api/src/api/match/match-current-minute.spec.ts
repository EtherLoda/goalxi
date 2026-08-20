import { computeCurrentInGameMinute } from './match-current-minute';

/**
 * Unit tests for the wall-clock → in-game minute derivation used by
 * the live match gateway + scheduler. The function is the source of
 * truth for the on-screen match clock during in-progress matches; if
 * any of the boundary cases below regress, the live page will
 * either freeze between events (e.g. 90' stuck during 2H injury
 * time) or skip minutes in a half (e.g. 45 → 47 across a half-time
 * break with no half-time event yet revealed).
 *
 * Wall-clock baseline for every test: kickoff = T0. We pass
 * `now = T0 + elapsedMin * 60_000` and assert the in-game minute.
 *
 * All the `2H regulation / 2H injury / 2H whistle` boundary tests
 * below use the same N1=2, N2=2 shape as the 2862cefd match that
 * was run live on 2026-08-19, so the in-game vs real-world minute
 * pairs (e.g. minute 90 at real-world 105, minute 92 at real-world
 * 107) come straight from `match_event` rows and the sim's
 * `computeEventRealTimeMs` formula.
 */
describe('computeCurrentInGameMinute — 1H regulation', () => {
  const kickoff = new Date('2026-08-19T13:00:00Z');
  const baseMatch = {
    scheduledAt: kickoff,
    firstHalfInjuryTime: 0,
    secondHalfInjuryTime: 0,
  };

  it('returns 0 before kickoff', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() - 1000),
    ).toBe(0);
  });

  it('returns 0 exactly at kickoff', () => {
    expect(computeCurrentInGameMinute(baseMatch, kickoff.getTime())).toBe(0);
  });

  it('returns 1 at kickoff + 60s (the first played minute)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 60_000),
    ).toBe(1);
  });

  it('returns 30 at kickoff + 30 min', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 30 * 60_000),
    ).toBe(30);
  });

  it('returns 44 at kickoff + 44 min (last regulation 1H minute)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 44 * 60_000),
    ).toBe(44);
  });

  it('returns 45 at kickoff + 45 min (whistle before injury)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 45 * 60_000),
    ).toBe(45);
  });
});

describe('computeCurrentInGameMinute — 1H injury + half-time', () => {
  const kickoff = new Date('2026-08-19T13:00:00Z');
  // N1=2, modelled after the live 2862cefd run. 1H ends at 47,
  // 2H kickoff at +60, 2H whistle at +107.
  const baseMatch = {
    scheduledAt: kickoff,
    firstHalfInjuryTime: 2,
    secondHalfInjuryTime: 2,
  };

  it('returns 46 at kickoff + 46 min (1H injury)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 46 * 60_000),
    ).toBe(46);
  });

  it('returns 47 at kickoff + 47 min (1H whistle)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 47 * 60_000),
    ).toBe(47);
  });

  it('freezes at 47 (1H whistle + N1) during the half-time break', () => {
    // The break runs from kickoff + 47 min (whistle) to kickoff + 60
    // min (2H kickoff). Any wall-clock instant strictly inside that
    // window must show 47, not 48, 49, ... — broadcasts freeze the
    // clock. T=60 is the kickoff instant itself and falls into
    // the 2H branch (clock jumps to 46), so we exclude it here.
    for (const elapsed of [48, 50, 55, 59]) {
      expect(
        computeCurrentInGameMinute(
          baseMatch,
          kickoff.getTime() + elapsed * 60_000,
        ),
      ).toBe(47);
    }
  });
});

describe('computeCurrentInGameMinute — 2H regulation + injury', () => {
  const kickoff = new Date('2026-08-19T13:00:00Z');
  // N1=2, N2=2. Real-world anchors (verified against the live
  // match_event rows for 2862cefd):
  //   1H whistle   minute 47  T=47
  //   2H kickoff  minute 46  T=60
  //   2H whistle  minute 92  T=107
  //   2H injury   minutes 91..92  T=106..107
  const baseMatch = {
    scheduledAt: kickoff,
    firstHalfInjuryTime: 2,
    secondHalfInjuryTime: 2,
  };

  it('returns 46 at kickoff + 60 min (2H kickoff instant)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 60 * 60_000),
    ).toBe(46);
  });

  it('returns 47 at kickoff + 62 min (1 min of 2H elapsed)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 62 * 60_000),
    ).toBe(47);
  });

  it('returns 60 at kickoff + 75 min (15 min of 2H elapsed)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 75 * 60_000),
    ).toBe(60);
  });

  it('returns 90 at kickoff + 105 min (last regulation 2H minute)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 105 * 60_000),
    ).toBe(90);
  });

  it('returns 91 at kickoff + 106 min (entering 2H injury)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 106 * 60_000),
    ).toBe(91);
  });

  it('returns 92 at kickoff + 107 min (2H whistle)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 107 * 60_000),
    ).toBe(92);
  });

  it('returns 92 at kickoff + 108 min (frozen at FT, non-ET)', () => {
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 108 * 60_000),
    ).toBe(92);
  });

  it('returns 92 at kickoff + 200 min (still frozen 90+ min after FT)', () => {
    // Regression: clock must not skip past 2H FT for a non-ET match.
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() + 200 * 60_000),
    ).toBe(92);
  });

  it('fills the 5-min gap between snapshot events smoothly (the original "stuck at 80" bug)', () => {
    // Live 2862cefd emitted snapshot at T=95 (minute 80) and the
    // next at T=100 (minute 85) — a 5-min gap. The old MAX(minute)
    // approach would show 80 for the whole gap. The wall-clock
    // formula advances the on-screen minute every second.
    for (const elapsed of [95, 96, 97, 98, 99, 100]) {
      const minute = computeCurrentInGameMinute(
        baseMatch,
        kickoff.getTime() + elapsed * 60_000,
      );
      expect(minute).toBe(elapsed - 15);
    }
  });
});

describe('computeCurrentInGameMinute — extra time (approximate)', () => {
  // The sim's ET realWorldOffset formulas overlap the 2H whistle
  // in non-obvious ways (ET 1H kickoff fires at T=105, but the 2H
  // whistle is at T=105+N2 — for N2>0 the 2H whistle is LATER
  // than the ET 1H kickoff in real-world time). For full ET
  // precision the gateway would need to read the ET 1H kickoff
  // event's actual eventScheduledTime and use it as the anchor;
  // this file pins the approximation we ship today (2H end + 5-min
  // break, then `T-15` again) so a future refactor doesn't quietly
  // break the regular case while trying to nail ET down.
  const kickoff = new Date('2026-08-19T13:00:00Z');
  const etMatch = {
    scheduledAt: kickoff,
    firstHalfInjuryTime: 2,
    secondHalfInjuryTime: 2,
    hasExtraTime: true,
    extraTimeFirstHalfInjury: 1,
    extraTimeSecondHalfInjury: 1,
  };

  it('freezes at 92 (2H FT) during the 5-min ET break', () => {
    // 2H FT is at T=107 (105+N2). ET break runs to T=112 (110+N2).
    for (const elapsed of [108, 110, 112]) {
      expect(
        computeCurrentInGameMinute(
          etMatch,
          kickoff.getTime() + elapsed * 60_000,
        ),
      ).toBe(92);
    }
  });

  it('advances from 91 once ET 1H begins', () => {
    // ET 1H starts after the break; the `T-15` approximation
    // begins counting up from there.
    expect(
      computeCurrentInGameMinute(etMatch, kickoff.getTime() + 113 * 60_000),
    ).toBe(98);
  });

  it('clamps to ET 1H whistle (106) once ET 1H is over', () => {
    expect(
      computeCurrentInGameMinute(etMatch, kickoff.getTime() + 121 * 60_000),
    ).toBe(106);
  });

  it('advances into ET 2H after the ET HT break', () => {
    // ET 2H starts at T=126 (125+ET_N1). Approximate formula
    // gives `T-15`, so T=127 → 112. Pin the "advances past 106"
    // behaviour, not the exact number.
    const minute = computeCurrentInGameMinute(
      etMatch,
      kickoff.getTime() + 127 * 60_000,
    );
    expect(minute).toBeGreaterThan(106);
  });
});

describe('computeCurrentInGameMinute — defensive clamps', () => {
  const kickoff = new Date('2026-08-19T13:00:00Z');
  const baseMatch = {
    scheduledAt: kickoff,
    firstHalfInjuryTime: 0,
    secondHalfInjuryTime: 0,
  };

  it('treats null/undefined injury times as 0 (pre-sim fallback)', () => {
    // The sim runs synchronously so the DB columns are always set
    // before any reveal tick — but if a caller passes null (e.g.
    // from an unmigrated row), the function should still produce
    // a sensible in-game minute instead of NaN.
    expect(
      computeCurrentInGameMinute(
        { ...baseMatch, firstHalfInjuryTime: null, secondHalfInjuryTime: null },
        kickoff.getTime() + 30 * 60_000,
      ),
    ).toBe(30);
  });

  it('handles a pre-kickoff instant without negative minutes leaking', () => {
    // Real-world bug: the gateway used to surface -1' on the live
    // page when the client joined a few seconds before kickoff.
    // The pre-kickoff branch must clamp to 0.
    expect(
      computeCurrentInGameMinute(baseMatch, kickoff.getTime() - 5_000),
    ).toBe(0);
  });
});
