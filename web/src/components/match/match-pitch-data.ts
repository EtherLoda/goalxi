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
  id: number;
  /** Position key from the engine. May be canonical (CBL) or legacy alias (CB). */
  p: string;
  n?: string;
  /** Current stamina 0–6 (engine scale; a fresh player = 6, exhausted = 0). */
  st?: number;
  /**
   * Current form 0–6 (engine scale; mirrors the `Player.form` field).
   * Used by the engine's ConditionSystem to derive `cm`.
   */
  f?: number;
  /**
   * Fitness factor 0–1 (from ConditionSystem.getFitnessFactor).
   * 1.0 = fresh, <1.0 = tired/overdraft.
   * Display as 0–100%: `ff × 100`.
   */
  ff?: number;
  /**
   * Normalised match contribution 0–100 (engine-computed; the final
   * "how much is this player actually contributing RIGHT NOW" number).
   */
  pc?: number;
  /**
   * Live power rating 0–20 (engine scale: 5-star max → 20). Combines
   * the per-snapshot position fit, contribution multiplier, and
   * star-bucket mapping. Use this to see "how well is the player
   * actually performing RIGHT NOW" in a single number.
   */
  sr?: number;
  /** Entry minute: 0 = started, >0 = substituted in. */
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
  playerId: number;
  /** Authoritative slot key (canonical). null when the slot cannot be resolved. */
  slotKey: PitchSlot | null;
  /** Display name from roster (or snapshot fallback). */
  name: string;
  /** Fitness factor 0–1 from snapshot (ConditionSystem.getFitnessFactor). */
  fitnessFactor?: number;
  /** Star rating 0–20 from snapshot. */
  starRating?: number;
  /** True when the player entered as a substitute. */
  isSubstitute?: boolean;
}

// ============================================================================
// buildCards — pure merger (snapshot > lineup)
// ============================================================================

/**
 * Build the rendered card list for one team.
 *
 * Authoritative source priority:
 *   1. Snapshot players — when the engine has emitted a snapshot
 *      (every 5 minutes, plus minute 0 / 45 / 46 / 90), it is the
 *      ground truth for who is on the pitch *right now*. This
 *      includes post-substitution state (the new player is in `ps`)
 *      and post-red-card state (the sent-off player is excluded).
 *   2. Lineup slots — only when no snapshot is available yet
 *      (pre-match / first paint, before the engine emits the
 *      minute-0 snapshot). We render the user-submitted starting XI.
 *
 * Position key resolution:
 *   - Snapshot.p is canonical OR legacy (`CB`/`CDL`/etc.). `toPitchSlot`
 *     folds legacy keys onto canonical slots.
 *   - If we cannot resolve the key, the player is rendered at the
 *     center of their half as a fallback (slotKey === null), so the
 *     match report still surfaces them rather than silently dropping.
 *
 * Why no lineup backfill when a snapshot is present:
 *   - A red-carded player is excluded from the snapshot's `ps` (the
 *     engine sets `isSentOff` and `mapPlayerStates` filters them out).
 *   - A subbed-out player is replaced in the snapshot's `ps` by
 *     the incoming substitute.
 *   - The original `tactics.lineup` still contains the OLD player IDs
 *     at those slots. Backfilling from it would resurrect the
 *     sent-off / subbed-out player onto the pitch, contradicting
 *     the snapshot. The earlier version of this function did exactly
 *     that — the FE kept showing David Klein (red card, no sub) on
 *     the pitch for the rest of the match even though the snapshot
 *     correctly excluded him. See `match-pitch-data.spec.ts` for
 *     the regression tests.
 */
export function buildCards(
  tactics: Tactics | null,
  snapshotPlayers: MatchSnapshotPlayer[] | null,
  rosterById: Map<number, Player>,
): PitchCard[] {
  const cards: PitchCard[] = [];

  // Snapshot wins when present. We deliberately do NOT fall back to
  // the lineup once a snapshot exists — the snapshot is the live
  // ground truth (post-sub, post-red-card, etc.).
  if (snapshotPlayers && snapshotPlayers.length > 0) {
    for (const sp of snapshotPlayers) {
      const slotKey = toPitchSlot(sp.p);
      const player = rosterById.get(sp.id) ?? null;
      const name = sp.n ?? player?.name ?? String(sp.id);
      cards.push({
        playerId: sp.id,
        slotKey,
        name,
        fitnessFactor: sp.ff,
        starRating: sp.sr,
        isSubstitute: sp.em !== undefined && sp.em > 0,
      });
    }
    return cards;
  }

  // Pre-match / no snapshot yet — render the user-submitted lineup.
  if (tactics?.lineup) {
    const { pitch } = normalizeLineup(tactics.lineup);
    for (const slot of PITCH_SLOTS) {
      const pid = pitch[slot];
      if (!pid) continue;
      const player = rosterById.get(pid) ?? null;
      cards.push({
        playerId: pid,
        slotKey: slot,
        name: player?.name ?? String(pid),
      });
    }
  }

  return cards;
}