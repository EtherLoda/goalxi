import type { MatchEvent, MatchStatsRes } from '@/lib/api';
import { buildStatRows } from './match-stats-rows';

const HOME = 'team-home';
const AWAY = 'team-away';

function ev(partial: Partial<MatchEvent> & { type: string }): MatchEvent {
  return {
    id: partial.id ?? `${partial.type}-${Math.random().toString(36).slice(2)}`,
    matchId: 'm1',
    minute: partial.minute ?? 10,
    second: 0,
    typeName: partial.typeName ?? partial.type,
    data: {},
    ...partial,
  } as MatchEvent;
}

function stats(overrides: {
  home?: Partial<MatchStatsRes['homeTeamStats']>;
  away?: Partial<MatchStatsRes['awayTeamStats']>;
}): MatchStatsRes {
  const base = {
    id: 's',
    matchId: 'm1',
    teamId: 't',
    possession: 50,
    possessionPercentage: '50.00',
    shots: 0,
    shotsOnTarget: 0,
    corners: 0,
    fouls: 0,
    offsides: 0,
    yellowCards: 0,
    redCards: 0,
    passes: 0,
    score: 0,
  };
  return {
    matchId: 'm1',
    homeTeamStats: { ...base, teamId: HOME, ...overrides.home },
    awayTeamStats: { ...base, teamId: AWAY, ...overrides.away },
    homeComputed: {} as MatchStatsRes['homeComputed'],
    awayComputed: {} as MatchStatsRes['awayComputed'],
  } as MatchStatsRes;
}

function row(rows: ReturnType<typeof buildStatRows>, key: string) {
  return rows.find((r) => r.key === key);
}

describe('buildStatRows', () => {
  it('returns nothing until the stats row exists', () => {
    expect(buildStatRows(null, [], HOME, AWAY)).toEqual([]);
  });

  it('maps counters onto rows in display order', () => {
    const events = [
      ev({ type: 'save', teamId: HOME, data: { lane: 'left', sequence: { shot: { result: 'save' } } } }),
      ev({ type: 'goal', teamId: HOME, data: { lane: 'center', sequence: { shot: { result: 'goal' } }, assistName: 'B' } }),
      ev({ type: 'miss', teamId: HOME, data: { lane: 'right', sequence: { shot: { result: 'miss' } } } }),
      ev({ type: 'corner', teamId: AWAY, data: { setPieceType: 'corner', result: 'save' } }),
      ev({ type: 'goal', teamId: AWAY, data: { setPieceType: 'penalty', result: 'goal' } }),
      ev({ type: 'turnover', teamId: AWAY, data: { via: 'intercept' } }),
    ];

    const rows = buildStatRows(
      stats({
        home: { corners: 1, fouls: 9, yellowCards: 2, redCards: 1 },
        away: { corners: 2, fouls: 11, yellowCards: 4, redCards: 0 },
      }),
      events,
      HOME,
      AWAY,
    );

    expect(rows.map((r) => r.key)).toEqual([
      'possession',
      'shots',
      'shotsOnTarget',
      'goals',
      'assists',
      'corners',
      'tackles',
      'fouls',
      'yellowCards',
      'redCards',
    ]);
    // Every shot attempt, set pieces included — the same predicate the
    // chances card uses, so 射门 equals its total.
    expect(row(rows, 'shots')).toMatchObject({ home: 3, away: 2 });
    expect(row(rows, 'shotsOnTarget')).toMatchObject({ home: 2, away: 2 });
    expect(row(rows, 'goals')).toMatchObject({ home: 1, away: 1 });
    expect(row(rows, 'fouls')).toMatchObject({ home: 9, away: 11 });
    // Tackles are turnovers: the defender who won the ball owns the event.
    expect(row(rows, 'tackles')).toMatchObject({ home: 0, away: 1 });
  });

  it('ignores the persisted shots column so old rows stay consistent', () => {
    // cd638314 shipped with shots=3/8 while the chances card said 7/8.
    const rows = buildStatRows(
      stats({ home: { shots: 3 }, away: { shots: 8 } }),
      [ev({ type: 'goal', teamId: HOME, data: { lane: 'left', sequence: { shot: { result: 'goal' } } } })],
      HOME,
      AWAY,
    );
    expect(row(rows, 'shots')).toMatchObject({ home: 1, away: 0 });
  });

  it('reads percentages that arrive as strings', () => {
    const rows = buildStatRows(
      stats({ home: { possessionPercentage: '61.50' }, away: { possessionPercentage: '38.50' } }),
      [],
      HOME,
      AWAY,
    );
    expect(row(rows, 'possession')).toEqual({
      key: 'possession',
      home: 61.5,
      away: 38.5,
      unit: 'percent',
    });
  });

  it('drops the possession row when the column was never written', () => {
    const rows = buildStatRows(
      stats({ home: { possessionPercentage: 0 }, away: { possessionPercentage: 0 } }),
      [],
      HOME,
      AWAY,
    );
    expect(row(rows, 'possession')).toBeUndefined();
    expect(rows[0].key).toBe('shots');
  });

  it('counts goals and assists from the event stream', () => {
    const events = [
      ev({ type: 'goal', isHome: true, data: { playerName: 'A', assistName: 'B' } }),
      ev({ type: 'goal', isHome: true, data: { playerName: 'C', assistName: null } }),
      ev({ type: 'goal', isHome: false, data: { playerName: 'D', assistName: 'E' } }),
      // A set-piece goal carries no assist name.
      ev({ type: 'goal', isHome: false, data: { playerName: 'F', setPieceType: 'penalty' } }),
    ];

    const rows = buildStatRows(stats({}), events, HOME, AWAY);
    expect(row(rows, 'goals')).toMatchObject({ home: 2, away: 2 });
    expect(row(rows, 'assists')).toMatchObject({ home: 1, away: 1 });
  });

  it('ignores shootout kicks and events with no resolvable side', () => {
    const events = [
      ev({ type: 'penalty_goal', minute: 120, data: { isPenalty: true } }),
      ev({ type: 'goal', data: { playerName: 'X' } }),
    ];
    const rows = buildStatRows(stats({}), events, HOME, AWAY);
    expect(row(rows, 'goals')).toMatchObject({ home: 0, away: 0 });
  });
});
