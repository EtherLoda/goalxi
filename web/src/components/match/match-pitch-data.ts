/**
 * match-pitch-data.ts — pure data layer for MatchPitch.
 *
 * Lives in a `.ts` file (not `.tsx`) so jest's `moduleFileExtensions`
 * (`['ts', 'js', 'json']`) can resolve it. Holds the merger that turns
 * submitted tactics + engine snapshot + roster into the rendered card
 * list. React rendering lives in `MatchPitch.tsx`.
 */

import type { Player, Tactics } from '@/lib/api';
import { PITCH_SLOTS, type PitchSlot } from '../tactics/types';
import { toPitchSlot, normalizeLineup } from '../tactics/api-helpers';

// ============================================================================
// Snapshot shape (matches what TacticalMatchDetail extracts from events)
// ============================================================================

export interface MatchSnapshotPlayer {
  id: string;
  /** Position key from the engine. May be canonical (CB1) or legacy alias (CB). */
  p: string;
  n?: string;
  /** Stamina 0–100. */
  st?: number;
  /** Star rating 0–100. */
  sr?: number;
  /** Entry minute (substitution). */
  em?: number;
}

export interface MatchSnapshotSide {
  n?: string;
  ps: MatchSnapshotPlayer[];
}

export interface MatchSnapshot {
  h: MatchSnapshotSide;
  a: MatchSnapshotSide;
}

// ============================================================================
// Card shape
// ============================================================================

export interface PitchCard {
  playerId: string;
  /** Authoritative slot key (canonical). null when the slot cannot be resolved. */
  slotKey: PitchSlot | null;
  /** Display name from roster (or snapshot fallback). */
  name: string;
  /** Optional from snapshot. */
  stamina?: number;
  /** Optional from snapshot. */
  starRating?: number;
}

// ============================================================================
// buildCards — pure merger (snapshot > lineup)
// ============================================================================

/**
 * Build the rendered card list for one team.
 *
 * Resolution priority:
 *   1. Snapshot players — carry mid-game stamina / star rating.
 *   2. Lineup slots — fill any slot the snapshot didn't cover.
 *
 * Position key resolution:
 *   - Snapshot.p is canonical OR legacy (`CB`/`CDL`/etc.). `toPitchSlot`
 *     folds legacy keys onto canonical slots.
 *   - If we cannot resolve the key, the player is rendered at the
 *     center of their half as a fallback (slotKey === null), so the
 *     match report still surfaces them rather than silently dropping.
 */
export function buildCards(
  tactics: Tactics | null,
  snapshotPlayers: MatchSnapshotPlayer[] | null,
  rosterById: Map<string, Player>,
): PitchCard[] {
  const cards: PitchCard[] = [];
  const seen = new Set<string>();

  // Snapshot first — wins on duplicate playerId.
  if (snapshotPlayers) {
    for (const sp of snapshotPlayers) {
      const slotKey = toPitchSlot(sp.p);
      const player = rosterById.get(sp.id) ?? null;
      const name = sp.n ?? player?.name ?? sp.id.slice(0, 6);
      cards.push({
        playerId: sp.id,
        slotKey,
        name,
        stamina: sp.st,
        starRating: sp.sr,
      });
      seen.add(sp.id);
    }
  }

  // Lineup backfill — only emit cards for players not already covered.
  if (tactics?.lineup) {
    const { pitch } = normalizeLineup(tactics.lineup);
    for (const slot of PITCH_SLOTS) {
      const pid = pitch[slot];
      if (!pid || seen.has(pid)) continue;
      const player = rosterById.get(pid) ?? null;
      cards.push({
        playerId: pid,
        slotKey: slot,
        name: player?.name ?? pid.slice(0, 6),
      });
    }
  }

  return cards;
}