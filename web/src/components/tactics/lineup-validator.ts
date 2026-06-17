/**
 * lineup-validator.ts — pure function, mirrors backend `LineupValidator` rules.
 *
 * Zero React, zero I/O. Called from the reducer's `REVALIDATE` action.
 * Returns an i18n-key list so the UI can translate error messages.
 */

import {
  ALL_POSITION_KEY_SET,
  BENCH_SLOT_SET,
  PITCH_SLOTS,
  type BenchSlot,
  type PitchSlot,
  type PositionKey,
  type TacticalEvent,
  type TacticsDraft,
} from './types';

// ============================================================================
// Player shape (minimal — only what the validator needs)
// ============================================================================

export interface ValidatorPlayer {
  id: string;
  isGoalkeeper: boolean;
  name: string;
}

// ============================================================================
// Validation context
// ============================================================================

export interface ValidationContext {
  draft: TacticsDraft;
  teamPlayerIds: ReadonlySet<string>;
  playersById: ReadonlyMap<string, ValidatorPlayer>;
}

// ============================================================================
// Result
// ============================================================================

export interface ValidationError {
  /** i18n key under `tactics.validation.*` */
  key: string;
  /** Interpolation values (player name, slot key, count, etc.) */
  params: Record<string, string | number>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// ============================================================================
// Validator
// ============================================================================

export function validateLineup(ctx: ValidationContext): ValidationResult {
  const errors: ValidationError[] = [];
  const { draft, teamPlayerIds, playersById } = ctx;

  // -- 1. Pitch slot keys must be valid (defensive — types prevent this in TS,
  //    but runtime data from server might include unknowns).
  for (const slot of Object.keys(draft.lineup) as PitchSlot[]) {
    if (!PITCH_SLOTS.includes(slot)) {
      errors.push({ key: 'invalidSlot', params: { slot } });
    }
  }

  // -- 2. Bench slot keys must be valid
  for (const slot of Object.keys(draft.bench) as BenchSlot[]) {
    if (!BENCH_SLOT_SET.has(slot)) {
      errors.push({ key: 'invalidSlot', params: { slot } });
    }
  }

  // -- 3. Pitch player count 9-11
  const pitchCount = countFilled(draft.lineup);
  if (pitchCount < 9) {
    errors.push({ key: 'playerCountMin', params: { count: pitchCount } });
  }
  if (pitchCount > 11) {
    errors.push({ key: 'playerCountMax', params: { count: pitchCount } });
  }

  // -- 4. All assigned playerIds must belong to the team
  const allAssigned: { slot: PositionKey; playerId: string }[] = [];
  for (const [slot, playerId] of Object.entries(draft.lineup) as [PitchSlot, string | undefined][]) {
    if (playerId) allAssigned.push({ slot, playerId });
  }
  for (const [slot, playerId] of Object.entries(draft.bench) as [BenchSlot, string | undefined][]) {
    if (playerId) allAssigned.push({ slot, playerId });
  }

  for (const { playerId } of allAssigned) {
    if (!teamPlayerIds.has(playerId)) {
      const player = playersById.get(playerId);
      errors.push({
        key: 'playerNotInTeam',
        params: { player: player?.name ?? playerId },
      });
    }
  }

  // -- 5. GK slot: must be present, must be a goalkeeper
  if (!draft.lineup.GK) {
    errors.push({ key: 'goalkeeperRequired', params: {} });
  } else {
    const gkId = draft.lineup.GK;
    const gk = playersById.get(gkId);
    if (gk && !gk.isGoalkeeper) {
      errors.push({ key: 'gkOnlyInGk', params: { player: gk.name } });
    }
  }

  // -- 6. No outfielders in GK (outfield slots cannot hold a GK)
  for (const [slot, playerId] of Object.entries(draft.lineup) as [PitchSlot, string | undefined][]) {
    if (slot === 'GK' || !playerId) continue;
    const player = playersById.get(playerId);
    if (player?.isGoalkeeper) {
      errors.push({ key: 'outfieldersNotInGk', params: { player: player.name, slot } });
    }
  }

  // -- 7. BENCH_GK: must be a goalkeeper
  if (draft.bench.BENCH_GK) {
    const player = playersById.get(draft.bench.BENCH_GK);
    if (player && !player.isGoalkeeper) {
      errors.push({ key: 'benchGkOnly', params: { player: player.name } });
    }
  }

  // -- 8. Other bench slots: cannot be a goalkeeper
  for (const [slot, playerId] of Object.entries(draft.bench) as [BenchSlot, string | undefined][]) {
    if (slot === 'BENCH_GK' || !playerId) continue;
    const player = playersById.get(playerId);
    if (player?.isGoalkeeper) {
      errors.push({ key: 'benchGkOnly', params: { player: player.name } });
    }
  }

  // -- 9. No duplicate players on the pitch (bench duplicates of pitch are allowed)
  const pitchIds = new Set<string>();
  for (const [slot, playerId] of Object.entries(draft.lineup) as [PitchSlot, string | undefined][]) {
    if (!playerId) continue;
    if (pitchIds.has(playerId)) {
      const player = playersById.get(playerId);
      errors.push({
        key: 'duplicatePlayer',
        params: { player: player?.name ?? playerId, slot },
      });
    }
    pitchIds.add(playerId);
  }

  // -- 10. Tactical events: playerIds must exist; moves must be to a different slot
  for (const event of draft.events) {
    if (event.kind === 'sub') {
      const out = playersById.get(event.outId);
      const inn = playersById.get(event.inId);
      if (out && inn && out.isGoalkeeper !== inn.isGoalkeeper) {
        errors.push({
          key: 'eventPlayerMissing',
          params: { minute: event.minute },
        });
      }
    } else if (event.kind === 'move') {
      const currentSlot = findSlotOfPlayer(draft, event.playerId);
      if (currentSlot === null) {
        errors.push({
          key: 'eventPlayerMissing',
          params: { minute: event.minute },
        });
      } else if (currentSlot === event.toSlot) {
        errors.push({
          key: 'moveToSamePosition',
          params: { minute: event.minute },
        });
      } else if (!ALL_POSITION_KEY_SET.has(event.toSlot)) {
        errors.push({ key: 'invalidSlot', params: { slot: event.toSlot } });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Helpers (exported for testing and reuse)
// ============================================================================

export function countFilled(lineup: Partial<Record<PitchSlot, string | null>>): number {
  return Object.values(lineup).filter((v): v is string => Boolean(v)).length;
}

export function findSlotOfPlayer(
  draft: TacticsDraft,
  playerId: string,
): PositionKey | null {
  for (const [slot, id] of Object.entries(draft.lineup) as [PitchSlot, string | undefined][]) {
    if (id === playerId) return slot;
  }
  for (const [slot, id] of Object.entries(draft.bench) as [BenchSlot, string | undefined][]) {
    if (id === playerId) return slot;
  }
  return null;
}
