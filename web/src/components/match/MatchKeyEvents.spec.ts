/**
 * Regression coverage for the `ev.playerId?.slice(0, 6)` TypeError that
 * fired in the 22:28 first-match when a real substitution event landed.
 *
 * The previous code path assumed `ev.playerId` was a string and tried to
 * `.slice(0, 6)` it as a fallback. The runtime value is a `number` (the
 * `match_event.player_id` column is `int`), so `Number.prototype.slice`
 * doesn't exist and the whole sidebar crashed. These tests pin the new
 * behaviour: rosters are consulted first, and the player name is
 * resolved through `String(playerId)` for the Map lookup, with a '?'
 * fallback if neither the data payload nor the roster has the player.
 */
import type { MatchEvent } from '@/lib/api';
import { extractKeyEvents } from './extract-key-events';

const home = '11111111-1111-1111-1111-111111111111';
const away = '22222222-2222-2222-2222-222222222222';
const roster = new Map<string, { name: string }>([
  ['101', { name: '李雷' }],
  ['202', { name: '韩梅梅' }],
  ['303', { name: 'Jim' }],
]);

const ev = (overrides: Partial<MatchEvent> & { typeName: string; minute: number; teamId?: string; playerId?: number; data?: Record<string, unknown> }): MatchEvent => ({
  id: 'e',
  matchId: 'm',
  minute: 0,
  second: 0,
  type: '0',
  typeName: '',
  ...overrides,
});

describe('MatchKeyEvents · resolveName fallback (regression)', () => {
  it('substitution event resolves the incoming player from the roster via String(playerId)', () => {
    // This is the exact shape that crashed live at 22:28: typeName='substitution',
    // numeric playerId, no `playerIn` / `substitutePlayerName` in data.
    const result = extractKeyEvents(
      [ev({ typeName: 'substitution', minute: 46, teamId: home, playerId: 202, data: { playerOut: '李雷' } })],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].icon).toBe('⇄');
    expect(result[0].label).toBe('韩梅梅'); // resolved via roster, NOT ev.playerId?.slice
    expect(result[0].sublabel).toBe('↔ 李雷');
  });

  it('goal event with no data payload falls back to the roster name', () => {
    const result = extractKeyEvents(
      [ev({ typeName: 'goal', minute: 12, teamId: home, playerId: 101 })],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('李雷');
  });

  it('yellow card event falls back to the roster name when data.playerName is missing', () => {
    const result = extractKeyEvents(
      [ev({ typeName: 'yellow_card', minute: 30, teamId: away, playerId: 303 })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('Jim');
    expect(result[0].sublabel).toBe('Yellow');
  });

  it('injury event falls back to the roster name', () => {
    const result = extractKeyEvents(
      [ev({ typeName: 'injury', minute: 70, teamId: home, playerId: 101 })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('李雷');
    expect(result[0].icon).toBe('🚑');
  });

  it('prefers data.playerName over the roster lookup', () => {
    // If the simulator already supplied a name (e.g. transliterated), keep it.
    const result = extractKeyEvents(
      [ev({ typeName: 'goal', minute: 5, teamId: home, playerId: 101, data: { playerName: 'Han Meimei' } })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('Han Meimei');
  });

  it('renders "?" when neither data nor the roster can resolve the player', () => {
    // Defensive ceiling: a stale roster, a brand-new sign-up, or an event
    // pointing to a player we don't track locally should not crash.
    const result = extractKeyEvents(
      [ev({ typeName: 'substitution', minute: 80, teamId: home, playerId: 99999, data: { playerOut: '?' } })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('?');
    expect(result[0].sublabel).toBe('↔ ?');
  });

  it('does not throw when playerId is undefined (no slice, no toString, no crash)', () => {
    expect(() =>
      extractKeyEvents(
        [ev({ typeName: 'goal', minute: 1, teamId: home, data: { playerName: 'TBD' } })],
        roster,
        home,
        away,
      ),
    ).not.toThrow();
  });
});
