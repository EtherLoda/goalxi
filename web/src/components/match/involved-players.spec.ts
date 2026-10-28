import { involvedPlayerIds, playerIdsToHighlight } from './involved-players';
import type { MatchEvent } from '@/lib/api';

/**
 * The pitch spotlight reads one thing off an event: who it names.
 *
 * These cases are the engine's actual payload shapes (see
 * `simulator/src/engine/match.engine.ts`):
 * - goals carry the scorer in `playerId` and the assister in `relatedPlayerId`
 *   (the serializer resolves the latter into `data.assistName`),
 * - `turnover` carries only `relatedPlayerId` — the interceptor,
 * - cards, injuries and saves name a single player.
 */
const event = (over: Partial<MatchEvent>): MatchEvent =>
  ({ id: 'e1', matchId: 'm1', minute: 10, second: 0, type: 'goal', ...over }) as MatchEvent;

describe('involvedPlayerIds', () => {
  it('returns the scorer and the assister for a goal', () => {
    expect(involvedPlayerIds(event({ playerId: 7, relatedPlayerId: 23 }))).toEqual([7, 23]);
  });

  it('returns only the booked player for a card', () => {
    expect(involvedPlayerIds(event({ type: 'yellow_card', playerId: 12 }))).toEqual([12]);
  });

  it('returns the interceptor for a turnover, which has no playerId', () => {
    expect(involvedPlayerIds(event({ type: 'turnover', relatedPlayerId: 31 }))).toEqual([31]);
  });

  it('returns the player coming on and the one going off for a substitution', () => {
    expect(involvedPlayerIds(event({ type: 'substitution', playerId: 4, relatedPlayerId: 9 })))
      .toEqual([4, 9]);
  });

  it('coerces WS string ids so both transports agree', () => {
    const wsShaped = event({
      playerId: '7' as unknown as number,
      relatedPlayerId: '23' as unknown as number,
    });
    expect(involvedPlayerIds(wsShaped)).toEqual([7, 23]);
  });

  it('drops duplicates, nulls and non-numeric ids', () => {
    expect(involvedPlayerIds(event({ playerId: 5, relatedPlayerId: 5 }))).toEqual([5]);
    expect(involvedPlayerIds(event({ playerId: 0, relatedPlayerId: undefined }))).toEqual([]);
    expect(involvedPlayerIds(event({ playerId: Number.NaN }))).toEqual([]);
  });

  it('returns nothing for a missing event', () => {
    expect(involvedPlayerIds(null)).toEqual([]);
    expect(involvedPlayerIds(undefined)).toEqual([]);
  });
});

describe('playerIdsToHighlight', () => {
  const events = [
    event({ id: 'e1', playerId: 7, relatedPlayerId: 23 }),
    event({ id: 'e2', type: 'yellow_card', playerId: 12 }),
  ];

  it('resolves the selected id to its players', () => {
    expect([...playerIdsToHighlight(events, 'e1')]).toEqual([7, 23]);
    expect([...playerIdsToHighlight(events, 'e2')]).toEqual([12]);
  });

  it('is empty when nothing is selected or the id is unknown', () => {
    expect(playerIdsToHighlight(events, null).size).toBe(0);
    expect(playerIdsToHighlight(events, 'nope').size).toBe(0);
  });
});
