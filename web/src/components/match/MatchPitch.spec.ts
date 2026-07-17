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

function mkPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    teamId: 'team-1',
    isGoalkeeper: false,
    position: null,
    overall: 80,
  } as unknown as Player;
}

function mkRoster(ids: string[]): Map<string, Player> {
  const map = new Map<string, Player>();
  for (const id of ids) {
    map.set(id, mkPlayer(id, `Player ${id}`));
  }
  return map;
}

function mkTactics(lineup: Record<string, string>): Tactics {
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

function mkSnapshotPlayer(id: string, p: string, opts: Partial<MatchSnapshotPlayer> = {}): MatchSnapshotPlayer {
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
      GK: 'p-gk',
      LB: 'p-lb', CB1: 'p-cb1', CB2: 'p-cb2', RB: 'p-rb',
      CM1: 'p-cm1', CM2: 'p-cm2', CM3: 'p-cm3',
      LW: 'p-lw', CF: 'p-cf', RW: 'p-rw',
    });
    const cards = buildCards(tactics, null, mkRoster([
      'p-gk', 'p-lb', 'p-cb1', 'p-cb2', 'p-rb',
      'p-cm1', 'p-cm2', 'p-cm3',
      'p-lw', 'p-cf', 'p-rw',
    ]));
    expect(cards).toHaveLength(11);
    // Slot key is the authoritative PitchSlot from the lineup.
    expect(cards.find((c) => c.playerId === 'p-gk')?.slotKey).toBe('GK');
    expect(cards.find((c) => c.playerId === 'p-cb1')?.slotKey).toBe('CB1');
    expect(cards.find((c) => c.playerId === 'p-cf')?.slotKey).toBe('CF');
  });

  it('uses the roster name when the lineup path is taken', () => {
    const roster = mkRoster(['p-cf']);
    // Override the auto-generated name for this player.
    roster.set('p-cf', mkPlayer('p-cf', 'Erling Haaland'));
    const cards = buildCards(mkTactics({ GK: 'p-cf' }), null, roster);
    expect(cards[0].name).toBe('Erling Haaland');
  });

  it('falls back to playerId slice when neither roster nor snapshot name is available', () => {
    const cards = buildCards(mkTactics({ GK: 'no-roster-id' }), null, mkRoster([]));
    expect(cards[0].name).toBe('no-ros'); // first 6 chars of playerId
  });

  it('snapshot wins when both snapshot and lineup reference the same player', () => {
    const roster = mkRoster(['p-cf']);
    const tactics = mkTactics({ CF: 'p-cf' });
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-cf', 'CF', { sr: 92, st: 80 })] },
      a: { ps: [] },
    } as MatchSnapshot;

    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(1);
    expect(cards[0].playerId).toBe('p-cf');
    expect(cards[0].starRating).toBe(92);
    expect(cards[0].stamina).toBe(80);
  });

  it('snapshot-only path: emits cards even when no tactics are submitted', () => {
    const roster = mkRoster(['p-cf']);
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-cf', 'CF', { n: 'Cunha', sr: 88 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, roster);
    expect(cards).toHaveLength(1);
    expect(cards[0].name).toBe('Cunha'); // snapshot.n preferred
    expect(cards[0].slotKey).toBe('CF');
  });

  it('resolves legacy alias snapshot keys (CB → CB1) into canonical slots', () => {
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-cb', 'CB')] }, // legacy alias
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards[0].slotKey).toBe('CB1');
  });

  it('emits a fallback slotKey === null for unrecognised snapshot positions', () => {
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-x', 'TOTALLY_BOGUS')] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards).toHaveLength(1);
    expect(cards[0].slotKey).toBeNull();
  });

  it('lineup backfill: lineup slots not covered by snapshot still render', () => {
    const roster = mkRoster(['p-gk', 'p-cf']);
    const tactics = mkTactics({ GK: 'p-gk', CF: 'p-cf' });
    // Snapshot only knows about the GK — the CF should come from lineup.
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-gk', 'GK', { sr: 70 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(2);
    const gkCard = cards.find((c) => c.playerId === 'p-gk');
    const cfCard = cards.find((c) => c.playerId === 'p-cf');
    expect(gkCard?.starRating).toBe(70);
    expect(cfCard?.starRating).toBeUndefined();
  });

  it('returns no lineup cards for slots whose player was already seen via snapshot', () => {
    const roster = mkRoster(['p-gk']);
    const tactics = mkTactics({ GK: 'p-gk' });
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer('p-gk', 'GK', { sr: 99 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    // Just one card, not two — duplicate playerId is deduped.
    expect(cards).toHaveLength(1);
    expect(cards[0].playerId).toBe('p-gk');
  });

  it('handles a complete 11-player snapshot with no tactics', () => {
    const roster = mkRoster([
      'p-gk', 'p-lb', 'p-cb1', 'p-cb2', 'p-rb',
      'p-cm1', 'p-cm2', 'p-cm3', 'p-lw', 'p-cf', 'p-rw',
    ]);
    const snapshot = {
      minute: 0,
      h: {
        ps: [
          mkSnapshotPlayer('p-gk', 'GK'),
          mkSnapshotPlayer('p-lb', 'LB'),
          mkSnapshotPlayer('p-cb1', 'CB1'),
          mkSnapshotPlayer('p-cb2', 'CB2'),
          mkSnapshotPlayer('p-rb', 'RB'),
          mkSnapshotPlayer('p-cm1', 'CM1'),
          mkSnapshotPlayer('p-cm2', 'CM2'),
          mkSnapshotPlayer('p-cm3', 'CM3'),
          mkSnapshotPlayer('p-lw', 'LW'),
          mkSnapshotPlayer('p-cf', 'CF'),
          mkSnapshotPlayer('p-rw', 'RW'),
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
          mkSnapshotPlayer('p-gk', 'GK'),
          mkSnapshotPlayer('p-cb-legacy', 'CB'),     // → CB1
          mkSnapshotPlayer('p-dm-legacy', 'DM'),     // → DMF1
          mkSnapshotPlayer('p-cfr', 'CFR'),
        ],
      },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(null, snapshot.h.ps, mkRoster([]));
    expect(cards.find((c) => c.playerId === 'p-cb-legacy')?.slotKey).toBe('CB1');
    expect(cards.find((c) => c.playerId === 'p-dm-legacy')?.slotKey).toBe('DMF1');
    expect(cards.find((c) => c.playerId === 'p-cfr')?.slotKey).toBe('CFR');
  });
});