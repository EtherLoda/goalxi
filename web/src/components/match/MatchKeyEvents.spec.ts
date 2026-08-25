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
import {
  GoalCenterIcon,
  YellowCardIcon,
  RedCardIcon,
  SubstitutionIcon,
  InjuryIcon,
} from './commentary-icons';

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
  // The override type requires `minute` and `typeName`, so they're
  // always supplied by the test — no dead defaults below.
  second: 0,
  type: '0',
  ...overrides,
});

describe('MatchKeyEvents · resolveName fallback (regression)', () => {
  it('substitution event resolves the incoming player from the roster via String(playerId)', () => {
    // RFC 0002 Phase 3 — the new tuple is the single source
    // of truth. SUBSTITUTION is class 8.
    const result = extractKeyEvents(
      [ev({ eventClassId: 8, typeName: 'substitution', minute: 46, teamId: home, playerId: 202, data: { playerOut: '李雷' } })],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].icon).toBe(SubstitutionIcon);
    expect(result[0].label).toBe('韩梅梅'); // resolved via roster, NOT ev.playerId?.slice
    expect(result[0].sublabel).toBe('↔ 李雷');
  });

  it('goal event with no data payload falls back to the roster name', () => {
    const result = extractKeyEvents(
      [ev({ eventClassId: 3, outcomeId: 1, typeName: 'goal', minute: 12, teamId: home, playerId: 101 })],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('李雷');
  });

  it('yellow card event falls back to the roster name when data.playerName is missing', () => {
    const result = extractKeyEvents(
      [ev({ eventClassId: 4, outcomeId: 6, typeName: 'yellow_card', minute: 30, teamId: away, playerId: 303 })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('Jim');
    expect(result[0].sublabel).toBe('Yellow');
  });

  it('injury event falls back to the roster name', () => {
    const result = extractKeyEvents(
      [ev({ eventClassId: 9, typeName: 'injury', minute: 70, teamId: home, playerId: 101 })],
      roster,
      home,
      away,
    );
    expect(result[0].label).toBe('李雷');
    expect(result[0].icon).toBe(InjuryIcon);
  });

  it('prefers data.playerName over the roster lookup', () => {
    // If the simulator already supplied a name (e.g. transliterated), keep it.
    const result = extractKeyEvents(
      [ev({ eventClassId: 3, outcomeId: 1, typeName: 'goal', minute: 5, teamId: home, playerId: 101, data: { playerName: 'Han Meimei' } })],
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
      [ev({ eventClassId: 8, typeName: 'substitution', minute: 80, teamId: home, playerId: 99999, data: { playerOut: '?' } })],
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
        [ev({ eventClassId: 3, outcomeId: 1, typeName: 'goal', minute: 1, teamId: home, data: { playerName: 'TBD' } })],
        roster,
        home,
        away,
      ),
    ).not.toThrow();
  });
});

/**
 * RFC 0003 — Specialty Attribution chip rendering. The
 * `extractKeyEvents` helper attaches a `specialtyChip` to
 * the event entry when the engine recorded a `primary`
 * contribution. These tests pin the chip contract so a
 * future refactor can't silently drop it.
 */
describe('MatchKeyEvents · specialty attribution chip (RFC 0003)', () => {
  it('attaches a chip for a goal with a primary AERIAL_THREAT header', () => {
    const result = extractKeyEvents(
      [
        ev({
          // RFC 0002 Phase 3 — the new tuple is the source of
          // truth. Without eventClassId=3 the event doesn't
          // classify as a goal at all.
          eventClassId: 3,
          outcomeId: 1,
          typeName: 'goal',
          minute: 23,
          teamId: home,
          playerId: 101,
          data: { playerName: '李雷', assistName: '韩梅梅' },
          specialtyContributions: [
            {
              playerId: 101,
              specialtyCode: 'AERIAL_THREAT',
              tier: 'GOLD',
              effectKey: 'shot_header',
              multiplier: 1.143,
              role: 'shooter',
              isPrimary: true,
            },
          ],
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result[0].specialtyChip).toBeDefined();
    expect(result[0].specialtyChip!.code).toBe('AERIAL_THREAT');
    expect(result[0].specialtyChip!.tier).toBe('GOLD');
    // 1.143 → +14% (rounded). The exact copy lives in
    // `formatSpecialtyBonus` (covered by its own spec); this
    // test pins the wiring, not the format.
    expect(result[0].specialtyChip!.bonusText).toBe('+14% 效果');
  });

  it('does NOT attach a chip when the only contribution is non-primary', () => {
    // A save by a SAVING_MASTER GK — primary lives on the
    // shooter side. But the goal event's primary is the
    // shooter. This case models a "GK got credited but
    // shooter is still primary" mismatch (defensive — engine
    // shouldn't produce this, but the FE must not crash).
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 3,
          outcomeId: 1,
          typeName: 'goal',
          minute: 23,
          teamId: home,
          data: { playerName: '李雷' },
          specialtyContributions: [
            {
              playerId: 202,
              specialtyCode: 'SAVING_MASTER',
              tier: 'SILVER',
              effectKey: 'gk_save',
              multiplier: 1.1,
              role: 'gk',
              isPrimary: false,
            },
          ],
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result[0].specialtyChip).toBeUndefined();
  });

  it('does NOT attach a chip when the contribution multiplier is 1.0 (defensive)', () => {
    // The engine never records 1.0 multipliers, but a stale
    // wire payload from a future schema drift could. The
    // helper must not produce a "+0% 效果" chip.
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 3,
          outcomeId: 1,
          typeName: 'goal',
          minute: 23,
          teamId: home,
          data: { playerName: '李雷' },
          specialtyContributions: [
            {
              playerId: 101,
              specialtyCode: 'AERIAL_THREAT',
              tier: 'BRONZE',
              effectKey: 'shot_header',
              multiplier: 1.0,
              role: 'shooter',
              isPrimary: true,
            },
          ],
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result[0].specialtyChip).toBeUndefined();
  });

  it('does NOT attach a chip for events without specialtyContributions', () => {
    // The 90% case: most events have no contribution array.
    // The field is undefined on the event, so the chip is
    // undefined on the entry.
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 3,
          outcomeId: 1,
          typeName: 'goal',
          minute: 23,
          teamId: home,
          data: { playerName: '李雷' },
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result[0].specialtyChip).toBeUndefined();
  });
});

/**
 * RFC 0002 — Two-Axis Event Coding. `extractKeyEvents` now
 * classifies via the new (eventClassId, outcomeId) tuple first
 * and falls back to `typeName` for legacy rows. These tests
 * pin the dual-read contract.
 */
describe('MatchKeyEvents · two-axis event classification (RFC 0002)', () => {
  it('classifies a SHOT+GOAL tuple (Phase 2 row) as a goal entry', () => {
    const result = extractKeyEvents(
      [
        ev({
          // eventClassId=3 (SHOT), outcomeId=1 (GOAL) is the
          // canonical "shot that scored" path.
          eventClassId: 3,
          outcomeId: 1,
          outcomeCode: 'GOAL',
          typeName: 'goal', // legacy column still present
          minute: 42,
          teamId: home,
          data: { playerName: '李雷' },
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].icon).toBe(GoalCenterIcon);
    expect(result[0].label).toContain('李雷');
  });

  it('classifies an OWN_GOAL tuple (class=11) as a goal entry with OG sublabel', () => {
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 11, // OWN_GOAL class
          outcomeId: null,  // OWN_GOAL has no outcome
          outcomeCode: null,
          typeName: 'own_goal',
          minute: 50,
          teamId: home,
          data: { playerName: '李雷' },
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].sublabel).toBe('OG');
  });

  it('classifies FOUL+YELLOW/SECOND_YELLOW/RED tuple as a card entry', () => {
    for (const [outcomeId, expectedCard] of [
      [6, 'Yellow'],
      [7, '2nd Yellow'],
      [8, 'Red'],
    ] as const) {
      const result = extractKeyEvents(
        [
          ev({
            eventClassId: 4, // FOUL class
            outcomeId,
            outcomeCode: expectedCard === '2nd Yellow' ? 'SECOND_YELLOW' : expectedCard === 'Red' ? 'RED' : 'YELLOW',
            typeName:
              expectedCard === '2nd Yellow'
                ? 'second_yellow'
                : expectedCard === 'Red'
                  ? 'red_card'
                  : 'yellow_card',
            minute: 60,
            teamId: home,
            data: { playerName: '李雷' },
          }),
        ],
        roster,
        home,
        away,
      );
      expect(result).toHaveLength(1);
      // D-style: SECOND_YELLOW is rendered as the red card glyph
      // (the player walks); only the sublabel distinguishes them.
      expect(result[0].icon).toBe(expectedCard === 'Yellow' ? YellowCardIcon : RedCardIcon);
      expect(result[0].sublabel).toBe(expectedCard);
    }
  });

  it('classifies SUBSTITUTION tuple (class=8) as a sub entry', () => {
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 8,
          outcomeId: 14, // TACTICAL
          outcomeCode: 'TACTICAL',
          typeName: 'substitution',
          minute: 70,
          teamId: home,
          data: { substitutePlayerName: '韩梅梅', playerOut: '李雷' },
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].icon).toBe(SubstitutionIcon);
    expect(result[0].label).toBe('韩梅梅');
    expect(result[0].sublabel).toBe('↔ 李雷');
  });

  it('classifies INJURY tuple (class=9) as an injury entry', () => {
    const result = extractKeyEvents(
      [
        ev({
          eventClassId: 9,
          outcomeId: null,
          outcomeCode: null,
          typeName: 'injury',
          minute: 80,
          teamId: home,
          data: { playerName: '李雷', severity: 'severe' },
        }),
      ],
      roster,
      home,
      away,
    );
    expect(result).toHaveLength(1);
    expect(result[0].icon).toBe(InjuryIcon);
    expect(result[0].sublabel).toBe('severe');
  });

  it('falls back to typeName for legacy rows (Phase 1 / pre-Phase 2)', () => {
    // RFC 0002 Phase 3 — the typeName fallback is GONE.
    // Without the new tuple, rows don't classify. This test
    // now pins the Phase 3 contract: legacy rows without
    // the tuple are unclassified. (In production, every
    // row has the tuple thanks to the Phase 1 backfill +
    // Phase 2 engine writes.)
    const result = extractKeyEvents(
      [
        ev({
          // No eventClassId / outcomeId — legacy row
          typeName: 'goal',
          minute: 23,
          teamId: home,
          data: { playerName: '李雷' },
        }),
        ev({
          typeName: 'yellow_card',
          minute: 30,
          teamId: home,
          data: { playerName: '李雷' },
        }),
        ev({
          typeName: 'substitution',
          minute: 50,
          teamId: home,
          data: { substitutePlayerName: '韩梅梅', playerOut: '李雷' },
        }),
        ev({
          typeName: 'injury',
          minute: 60,
          teamId: home,
          data: { playerName: '李雷', severity: 'minor' },
        }),
      ],
      roster,
      home,
      away,
    );
    // All 4 events have only typeName (no tuple), so none
    // classify. The list is empty.
    expect(result).toEqual([]);
  });

  it('skips non-key events (KICKOFF, PERIOD, SNAPSHOT, etc.)', () => {
    // Even with the new tuple, non-key classes must not produce
    // a row. classId 1 (KICKOFF), 2 (PERIOD), 17 (SNAPSHOT)
    // all return null from classifyEvent.
    const result = extractKeyEvents(
      [
        ev({ eventClassId: 1,  typeName: 'kickoff',                 minute: 0,  teamId: home }),
        ev({ eventClassId: 2,  typeName: 'half_time',               minute: 45, teamId: home }),
        ev({ eventClassId: 17, typeName: 'snapshot',                minute: 5,  teamId: home }),
      ],
      roster,
      home,
      away,
    );
    expect(result).toEqual([]);
  });
});
