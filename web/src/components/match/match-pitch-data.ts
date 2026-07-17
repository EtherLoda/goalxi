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
// Lane shape (mirrors libs/database `SnapshotLaneStrengths` /
// `SnapshotLaneCounters` — kept inline here so the match page can import
// without reaching into @goalxi/database).
// ============================================================================

export type Lane = 'left' | 'center' | 'right';

/**
 * Per-snapshot lane strength for one team. Numbers are 1-decimal floats
 * emitted by the simulator's `formatLanes` helper.
 */
export interface SnapshotLaneStrengths {
  left: { atk: number; def: number; pos: number };
  center: { atk: number; def: number; pos: number };
  right: { atk: number; def: number; pos: number };
}

/**
 * Per-snapshot push-success counters for one team. The `pr` / `mpr`
 * fields are engine-computed expected probabilities (mean of
 * `duelProbability(...)` across every duel in this lane) — the FE's
 * Push Success Rate and Possession Share panels read them directly
 * (no `ps_ / att` division on the client). `att` / `ps_` stay for
 * debugging and future rate-based tooling. See
 * `libs/database/src/types/match-event-data.ts` for the canonical shape.
 */
export interface SnapshotLaneCounters {
  left: { att: number; ps_: number; pr: number; mpr: number };
  center: { att: number; ps_: number; pr: number; mpr: number };
  right: { att: number; ps_: number; pr: number; mpr: number };
}

export const LANES: readonly Lane[] = ['left', 'center', 'right'];

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
  /** Lane strengths emitted by the simulator (1-decimal floats). */
  ls?: SnapshotLaneStrengths;
  /**
   * Lane counters emitted by the simulator. Older matches pre-dating
   * the lc field will have this undefined — UI must guard.
   */
  lc?: SnapshotLaneCounters;
  /** GK rating at snapshot. */
  gk?: number;
  ps: MatchSnapshotPlayer[];
}

export interface MatchSnapshot {
  /** Snapshot minute — used by the snapshot scrubber on the match page. */
  minute: number;
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