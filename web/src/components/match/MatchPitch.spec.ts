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
    const cards = buildCards(mkTactics({ GK: 999999 }), null, mkRoster([]));
    expect(cards[0].name).toBe('999999');
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

  it('resolves legacy alias snapshot keys (CDL → CBL) into canonical slots', () => {
    // Note: 'CB' is now a canonical pitch slot, so the legacy CB→CBL
    // aliasing is a no-op (CB passes through). The non-canonical codes
    // 'CDL' / 'CDR' / 'CD' are what the legacy map still folds; we use
    // CDL here to exercise the alias path.
    const snapshot = {
      minute: 0,
      h: { ps: [mkSnapshotPlayer(2, 'CDL')] }, // legacy alias
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

  it('does NOT backfill from lineup when a snapshot is present (regression: red card / sub)', () => {
    // The pitch must reflect mid-game reality. Two scenarios that
    // broke before the fix:
    //
    //   1. Red card: the sent-off player is excluded from snapshot.ps
    //      by the engine. The original `tactics.lineup` still has
    //      them. We must NOT resurrect them onto the pitch.
    //   2. Substitution: the subbed-out player is replaced in
    //      snapshot.ps by the incoming substitute. The original
    //      `tactics.lineup` still has the OLD player. We must NOT
    //      bring the old player back to their old slot.
    //
    // Both cases were broken by a "snapshot first, then lineup
    // backfill" loop in an earlier version of buildCards.
    const roster = mkRoster([4, 1]);
    const tactics = mkTactics({ GK: 4, CF: 1 });
    // Snapshot only knows about the GK — the CF slot is empty in
    // the snapshot (because the CF was subbed off / sent off).
    const snapshot = {
      minute: 10,
      h: { ps: [mkSnapshotPlayer(4, 'GK', { sr: 70 })] },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    // Just the GK — the CF player from the lineup is NOT pulled back in.
    expect(cards).toHaveLength(1);
    expect(cards[0].playerId).toBe(4);
  });

  it('post-red-card: snapshot.ps with 10 players + 11-player lineup → 10 cards only', () => {
    // Real scenario from match b6fab106: David Klein red-carded at
    // minute 8 (no bench sub available — plays with 10 men). The
    // minute-10 snapshot excludes him from h.ps. The lineup still
    // has him. The pitch must show 10 players, not 11.
    const roster = mkRoster([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const tactics = mkTactics({
      GK: 1, LB: 2, CBL: 3, CB: 4, RB: 5,
      CML: 6, CM: 7, CMR: 8,
      LW: 9, CF: 10, RW: 11,
    });
    // The 10-player snapshot — player 6 (David Klein) is gone.
    const snapshot = {
      minute: 10,
      h: {
        ps: [
          mkSnapshotPlayer(1, 'GK'),
          mkSnapshotPlayer(2, 'LB'),
          mkSnapshotPlayer(3, 'CBL'),
          mkSnapshotPlayer(4, 'CB'),
          mkSnapshotPlayer(5, 'RB'),
          // 6 missing — sent off
          mkSnapshotPlayer(7, 'CM'),
          mkSnapshotPlayer(8, 'CMR'),
          mkSnapshotPlayer(9, 'LW'),
          mkSnapshotPlayer(10, 'CF'),
          mkSnapshotPlayer(11, 'RW'),
        ],
      },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(10);
    expect(cards.map((c) => c.playerId)).not.toContain(6);
  });

  it('post-substitution: snapshot.ps has the new sub, lineup has the old player → only the new sub renders', () => {
    // The classic sub case: at minute 25, the engine replaces
    // player 6 with player 99 in team.players (and in the next
    // snapshot's ps array). The lineup still has player 6 at CML.
    // The pitch must show player 99, not player 6.
    const roster = mkRoster([1, 2, 3, 4, 5, 99, 7, 8, 9, 10, 11]);
    const tactics = mkTactics({
      GK: 1, LB: 2, CBL: 3, CB: 4, RB: 5,
      CML: 6, // <-- still 6 in the (stale) lineup
      CM: 7, CMR: 8,
      LW: 9, CF: 10, RW: 11,
    });
    // Snapshot at minute 25 — player 6 has been replaced by 99.
    const snapshot = {
      minute: 25,
      h: {
        ps: [
          mkSnapshotPlayer(1, 'GK'),
          mkSnapshotPlayer(2, 'LB'),
          mkSnapshotPlayer(3, 'CBL'),
          mkSnapshotPlayer(4, 'CB'),
          mkSnapshotPlayer(5, 'RB'),
          mkSnapshotPlayer(99, 'CML', { n: 'Bench Hero', em: 22 }),
          mkSnapshotPlayer(7, 'CM'),
          mkSnapshotPlayer(8, 'CMR'),
          mkSnapshotPlayer(9, 'LW'),
          mkSnapshotPlayer(10, 'CF'),
          mkSnapshotPlayer(11, 'RW'),
        ],
      },
      a: { ps: [] },
    } as MatchSnapshot;
    const cards = buildCards(tactics, snapshot.h.ps, roster);
    expect(cards).toHaveLength(11);
    const ids = cards.map((c) => c.playerId);
    expect(ids).toContain(99);
    expect(ids).not.toContain(6);
    const sub = cards.find((c) => c.playerId === 99);
    expect(sub?.isSubstitute).toBe(true);
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
          mkSnapshotPlayer(100, 'CDL'),    // → CBL
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