/**
 * MatchPitch.spec.ts — tests the pure `buildCards` merger inside MatchPitch.
 *
 * React rendering is exercised in Phase G via the running app; the jest
 * config runs in `node` environment with no jsdom. We cover the data
 * layer that decides which player lands at which slot.
 */

import type { Player, Tactics } from '@/lib/api';
import {
  buildCards,
  type MatchSnapshot,
  type MatchSnapshotPlayer,
} from './match-pitch-data';

// ============================================================================
// Fixtures
// ============================================================================

function mkPlayer(id: number, name: string): Player {
  return {
    id,
    name,
    teamId: 'team-1',
    isGoalkeeper: false,
    position: null,
    overall: 80,
  } as unknown as Player;
}

function mkRoster(ids: number[]): Map<number, Player> {
  const map = new Map<number, Player>();
  for (const id of ids) {
    map.set(id, mkPlayer(id, `Player ${id}`));
  }
  return map;
}

function mkTactics(lineup: Record<string, number>): Tactics {
  return {
    id: 't-1',
    matchId: 'm-1',
    teamId: 'team-1',
    formation: '4-3-3',
    lineup,
    tempo: 'balanced',
    pitchWidth: 'balanced',
    defensiveLine: 'mid',
    substitutions: null,
    instructions: null,
    submittedAt: '2026-07-07T00:00:00.000Z',
    presetId: null,
  };
}

function mkSnapshotPlayer(id: number, p: string, opts: Partial<MatchSnapshotPlayer> = {}): MatchSnapshotPlayer {
  return { id, p, ...opts };
}

// ============================================================================
// buildCards
// ============================================================================

describe('buildCards', () => {
  it('returns no cards when both tactics and snapshot are empty', () => {
    const cards = buildCards(null, null, mkRoster([]));
    expect(cards).toEqual([]);
  });

  it('emits a card per pitch slot when only lineup is provided', () => {
    const tactics = mkTactics({
      GK: 4,
      LB: 5, CBL: 6, CB: 7, RB: 8,
      CML: 9, CM: 10, CMR: 12,
      LW: 13, CF: 1, RW: 14,
    });
    const cards = buildCards(tactics, null, mkRoster([
      4, 5, 6, 7, 8,
      9, 10, 12,
      13, 1, 14,
    ]));
    expect(cards).toHaveLength(11);
    // Slot key is the authoritative PitchSlot from the lineup.
    expect(cards.find((c) => c.playerId === 4)?.slotKey).toBe('GK');
    expect(cards.find((c) => c.playerId === 6)?.slotKey).toBe('CBL');
    expect(cards.find((c) => c.playerId === 1)?.slotKey).toBe('CF');
  });

  it('uses the roster name when the lineup path is taken', () => {
    const roster = mkRoster([1]);
    // Override the auto-generated name for this player.
    roster.set(1, mkPlayer(1, 'Erling Haaland'));
    const cards = buildCards(mkTactics({ GK: 1 }), null, roster);
    expect(cards[0].name).toBe('Erling Haaland');
  });

  it('falls back to playerId slice when neither roster nor snapshot name is available', () => {
    const cards = buildCards(mkTactics({ GK: 'no-roster-id' }), null, mkRoster([]));
    expect(cards[0].name).toBe('no-ros'); // first 6 chars of playerId
  });

  it('snapshot wins when both snapshot and lineup reference the same player', () => {
    const roster = mkRoster([1]);
    const tactics = mkTactics({ CF: 1 });
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(1, 'CF', { sr: 92, ff: 0.85 })] },
      a: { ps: [] },
    } as MatchSnapshot;

    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(1);
    expect(cards[0].playerId).toBe(1);
    expect(cards[0].starRating).toBe(92);
    // fitnessFactor (0-1) comes from the snapshot's ff field directly
    expect(cards[0].fitnessFactor).toBe(0.85);
  });

  it('snapshot-only path: emits cards even when no tactics are submitted', () => {
    const roster = mkRoster([1]);
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(1, 'CF', { n: 'Cunha', sr: 88 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, roster);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Cunha'); // snapshot.n preferred
    expect(cards[0].slotKey).toBe('CF');
  });

  it('resolves legacy alias snapshot keys (CB → CBL) into canonical slots', () => {
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(2, 'CB')] }, // legacy alias
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards[0].slotKey).toBe('CBL');
  });

  it('emits a fallback slotKey === null for unrecognised snapshot positions', () => {
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(3, 'TOTALLY_BOGUS')] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards).toHaveLength(1);
    expect(cards[0].slotKey).toBeNull();
  });

  it('lineup backfill: lineup slots not covered by snapshot still render', () => {
    const roster = mkRoster([4, 1]);
    const tactics = mkTactics({ GK: 4, CF: 1 });
    // Snapshot only knows about the GK — the CF should come from lineup.
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(4, 'GK', { sr: 70 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(2);
    const gkCard = cards.find((c) => c.playerId === 4);
    const cfCard = cards.find((c) => c.playerId === 1);
    expect(gkCard?.starRating).toBe(70);
    expect(cfCard?.starRating).toBeUndefined();
  });

  it('returns no lineup cards for slots whose player was already seen via snapshot', () => {
    const roster = mkRoster([4]);
    const tactics = mkTactics({ GK: 4 });
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(4, 'GK', { sr: 99 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    // Just one card, not two — duplicate playerId is deduped.
    expect(cards).toHaveLength(1);
    expect(cards[0].playerId).toBe(4);
  });

  it('handles a complete 11-player snapshot with no tactics', () => {
    const roster = mkRoster([
      4, 5, 6, 7, 8,
      9, 10, 12, 13, 1, 14,
    ]);
    const snapshot = {
      minute: 0,
      h: {
        ps: [
          mkSnapshotPlayer(4, 'GK'),
          mkSnapshotPlayer(5, 'LB'),
          mkSnapshotPlayer(6, 'CBL'),
          mkSnapshotPlayer(7, 'CB'),
          mkSnapshotPlayer(8, 'RB'),
          mkSnapshotPlayer(9, 'CML'),
          mkSnapshotPlayer(10, 'CM'),
          mkSnapshotPlayer(12, 'CMR'),
          mkSnapshotPlayer(13, 'LW'),
          mkSnapshotPlayer(1, 'CF'),
          mkSnapshotPlayer(14, 'RW'),
        ],
      },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, roster);
    expect(cards).toHaveLength(11);
    // No duplicates, all canonical slot keys.
    const ids = cards.map((c) => c.playerId);
    expect(new Set(ids).size).toBe(11);
    for (const c of cards) {
      expect(c.slotKey).not.toBeNull();
    }
  });

  it('mixes legacy and canonical keys in the same snapshot', () => {
    const snapshot = {
      minute: 0,
      h: {
        ps: [
          mkSnapshotPlayer(4, 'GK'),
          mkSnapshotPlayer(100, 'CB'),     // → CBL
          mkSnapshotPlayer(101, 'DM'),     // → DMFL
          mkSnapshotPlayer(11, 'CFR'),
        ],
      },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards.find((c) => c.playerId === 100)?.slotKey).toBe('CBL');
    expect(cards.find((c) => c.playerId === 101)?.slotKey).toBe('DMFL');
    expect(cards.find((c) => c.playerId === 11)?.slotKey).toBe('CFR');
  });
});