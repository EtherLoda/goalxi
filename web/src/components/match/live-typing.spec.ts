import { newestTypedEventId } from './live-typing';
import type { MatchEvent } from '@/lib/api';

const ev = (id: string, type: string): MatchEvent =>
  ({ id, matchId: 'm1', minute: 10, second: 0, type, typeName: type }) as MatchEvent;

describe('newestTypedEventId', () => {
  it('returns the last event in arrival order', () => {
    expect(
      newestTypedEventId([ev('a', 'kickoff'), ev('b', 'goal'), ev('c', 'shot')]),
    ).toBe('c');
  });

  it('skips snapshots so a snapshot cannot steal the typing window', () => {
    expect(
      newestTypedEventId([ev('a', 'goal'), ev('b', 'SNAPSHOT'), ev('c', 'snapshot')]),
    ).toBe('a');
  });

  it('skips rows without an id', () => {
    const missing = { matchId: 'm1', minute: 12, second: 0, type: 'shot', typeName: 'shot' } as MatchEvent;
    expect(newestTypedEventId([ev('a', 'goal'), missing])).toBe('a');
  });

  it('returns null when there is nothing to type', () => {
    expect(newestTypedEventId([])).toBeNull();
    expect(newestTypedEventId([ev('s', 'SNAPSHOT')])).toBeNull();
  });
});
