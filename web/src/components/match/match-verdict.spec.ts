import { describe, it, expect } from '@jest/globals';
import { deriveVerdict, laneBars, laneNet, type VerdictInput } from './match-verdict';

function side(over: Partial<VerdictInput['home']> = {}): VerdictInput['home'] {
  return {
    name: 'Home',
    goals: 0,
    shotsOnTarget: 0,
    possessionPct: 50,
    lanes: {
      left: { attack: 6, defense: 6, possession: 50 },
      center: { attack: 6, defense: 6, possession: 50 },
      right: { attack: 6, defense: 6, possession: 50 },
    },
    ...over,
  };
}

function input(over: Partial<VerdictInput> = {}): VerdictInput {
  return { home: side(), away: side({ name: 'Away' }), ...over };
}

describe('laneNet', () => {
  it('is zero for identical sides', () => {
    const i = input();
    expect(laneNet(i.home.lanes, i.away.lanes, 'center')).toBeCloseTo(0, 6);
  });

  it('nets attack against the opposite defence, not raw attack', () => {
    const i = input({
      home: side({
        lanes: {
          left: { attack: 9, defense: 6, possession: 50 },
          center: { attack: 6, defense: 6, possession: 50 },
          right: { attack: 6, defense: 6, possession: 50 },
        },
      }),
      away: side({
        name: 'Away',
        lanes: {
          left: { attack: 6, defense: 4, possession: 50 },
          center: { attack: 6, defense: 6, possession: 50 },
          right: { attack: 6, defense: 6, possession: 50 },
        },
      }),
    });
    // home attack 9 vs away defence 4 = +5; away attack 6 vs home defence 6 = 0.
    expect(laneNet(i.home.lanes, i.away.lanes, 'left')).toBeCloseTo(5, 6);
  });
});

describe('laneBars', () => {
  it('puts an even match at the centre of every bar', () => {
    for (const bar of laneBars(input())) {
      expect(bar.homeShare).toBeCloseTo(0.5, 6);
    }
  });

  it('scales the strongest lane to the end of the bar', () => {
    const i = input({
      home: side({
        lanes: {
          left: { attack: 9, defense: 6, possession: 50 },
          center: { attack: 6, defense: 6, possession: 50 },
          right: { attack: 6, defense: 6, possession: 50 },
        },
      }),
    });
    const bars = laneBars(i);
    expect(bars[0].homeShare).toBeCloseTo(1, 6);
    expect(bars[1].homeShare).toBeCloseTo(0.5, 6);
  });
});

describe('deriveVerdict', () => {
  it('calls out possession that did not convert', () => {
    const v = deriveVerdict(
      input({
        home: side({ name: 'Home', goals: 1, possessionPct: 62 }),
        away: side({ name: 'Away', goals: 2, possessionPct: 38 }),
      }),
    );
    expect(v.key).toBe('possessionButLost');
    expect(v.params.team).toBe('Home');
    expect(v.params.pct).toBe(62);
  });

  it('does not call out possession when the dominant side won', () => {
    const v = deriveVerdict(
      input({
        home: side({ name: 'Home', goals: 2, possessionPct: 62 }),
        away: side({ name: 'Away', goals: 1, possessionPct: 38 }),
      }),
    );
    expect(v.key).not.toBe('possessionButLost');
  });

  it('names the decisive lane when one side owned it', () => {
    const v = deriveVerdict(
      input({
        home: side({
          name: 'Home',
          goals: 2,
          lanes: {
            left: { attack: 6, defense: 6, possession: 50 },
            center: { attack: 9, defense: 7, possession: 55 },
            right: { attack: 6, defense: 6, possession: 50 },
          },
        }),
        away: side({ name: 'Away', goals: 0 }),
      }),
    );
    expect(v.key).toBe('wonOnLane');
    expect(v.params.team).toBe('Home');
    expect(v.params.lane).toBe('center');
    // home attack 9 vs away defence 6 = +3; away attack 6 vs home defence 7 = -1.
    expect(v.params.edge).toBe('4.0');
  });

  it('falls back to finishing when the lanes are level', () => {
    const v = deriveVerdict(
      input({
        home: side({ name: 'Home', goals: 3, shotsOnTarget: 7 }),
        away: side({ name: 'Away', goals: 0, shotsOnTarget: 1 }),
      }),
    );
    expect(v.key).toBe('clinical');
    expect(v.params.onTarget).toBe(7);
  });

  it('reports a one-goal game as tight when nothing else separates them', () => {
    const v = deriveVerdict(
      input({
        home: side({ name: 'Home', goals: 1, shotsOnTarget: 3 }),
        away: side({ name: 'Away', goals: 0, shotsOnTarget: 2 }),
      }),
    );
    expect(v.key).toBe('tight');
    expect(v.params.team).toBe('Home');
  });

  it('reports a draw as even', () => {
    const v = deriveVerdict(input());
    expect(v.key).toBe('even');
    expect(v.params).toEqual({});
  });
});
