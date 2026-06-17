/**
 * api-helpers.ts — pure serialization helpers between editor draft and API payloads.
 *
 * - `serializeTactics`: draft → `SubmitTacticsReqDto` body
 * - `hydrateDraft`: server `TacticsResDto` → `HydratePayload` for reducer HYDRATE
 * - `serializePreset`: draft → `CreatePresetReqDto` body
 *
 * No React, no fetch. The actual `api.matches.submitTactics(...)` call lives in
 * the page component so the helpers can be reused by both the submit button
 * handler and the apply-preset handler.
 */

import type { TacticsDraft, TacticalEvent, PositionKey } from './types';
import type { HydratePayload, PresetPayload } from './use-tactics-state';

// ============================================================================
// Backend payload shapes (mirror SubmitTacticsReqDto, CreatePresetReqDto)
// ============================================================================

export interface SubmitTacticsPayload {
  teamId: string;
  formation: string;
  lineup: Record<string, string>;
  tempo: 'slow' | 'balanced' | 'fast';
  pitchWidth: 'narrow' | 'balanced' | 'wide';
  defensiveLine: 'low' | 'mid' | 'high';
  substitutions: Array<{ minute: number; out: string; in: string }>;
  instructions: { moves: Array<{ minute: number; player: string; position: string }> };
  presetId: string | null;
}

export interface CreatePresetPayload {
  name: string;
  formation: string;
  lineup: Record<string, string>;
  isDefault: boolean;
  substitutions: Array<{ minute: number; out: string; in: string }> | null;
  instructions: { moves: Array<{ minute: number; player: string; position: string }> } | null;
}

// ============================================================================
// Formation computation (mirror of selectFormation, but standalone for serialization)
// ============================================================================

export function computeFormation(lineup: TacticsDraft['lineup']): string {
  // Defenders: back line only (LB, CB1-3, RB, LWB, RWB). GK is excluded.
  const defenders = ['LB', 'CB1', 'CB2', 'CB3', 'RB', 'LWB', 'RWB'].filter(
    (s) => lineup[s as keyof TacticsDraft['lineup']],
  ).length;
  // Midfielders: DMF1-3, CM1-3, CAM1-3, LM, RM
  const midfielders = ['DMF1', 'DMF2', 'DMF3', 'CM1', 'CM2', 'CM3', 'CAM1', 'CAM2', 'CAM3', 'LM', 'RM'].filter(
    (s) => lineup[s as keyof TacticsDraft['lineup']],
  ).length;
  // Attackers: LW, RW, CFL, CF, CFR
  const attackers = ['LW', 'RW', 'CFL', 'CF', 'CFR'].filter(
    (s) => lineup[s as keyof TacticsDraft['lineup']],
  ).length;
  return `${defenders}-${midfielders}-${attackers}`;
}

// ============================================================================
// Lineup flattening
// ============================================================================

/**
 * Flatten pitch + bench into a single `slot → playerId` map for the backend.
 * Strips slot aliases (frontend `CD`/etc) — backend uses canonical keys.
 */
export function flattenLineup(draft: TacticsDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slot, id] of Object.entries(draft.lineup)) {
    if (id) out[slot] = id;
  }
  for (const [slot, id] of Object.entries(draft.bench)) {
    if (id) out[slot] = id;
  }
  return out;
}

// ============================================================================
// Event flattening
// ============================================================================

function flattenEvents(events: TacticalEvent[]): {
  substitutions: SubmitTacticsPayload['substitutions'];
  moves: SubmitTacticsPayload['instructions']['moves'];
} {
  const substitutions: SubmitTacticsPayload['substitutions'] = [];
  const moves: SubmitTacticsPayload['instructions']['moves'] = [];
  for (const e of events) {
    if (e.kind === 'sub') {
      substitutions.push({ minute: e.minute, out: e.outId, in: e.inId });
    } else {
      moves.push({ minute: e.minute, player: e.playerId, position: e.toSlot as string });
    }
  }
  return { substitutions, moves };
}

// ============================================================================
// Serialization
// ============================================================================

export function serializeTactics(
  matchId: string,
  teamId: string,
  draft: TacticsDraft,
): SubmitTacticsPayload & { _matchId: string } {
  const { substitutions, moves } = flattenEvents(draft.events);
  return {
    _matchId: matchId,
    teamId,
    formation: computeFormation(draft.lineup),
    lineup: flattenLineup(draft),
    tempo: draft.tempo,
    pitchWidth: draft.pitchWidth,
    defensiveLine: draft.defensiveLine,
    substitutions,
    instructions: { moves },
    presetId: draft.activePresetId,
  };
}

export function serializePreset(
  name: string,
  isDefault: boolean,
  draft: TacticsDraft,
): CreatePresetPayload {
  const { substitutions, moves } = flattenEvents(draft.events);
  return {
    name,
    formation: computeFormation(draft.lineup),
    lineup: flattenLineup(draft),
    isDefault,
    substitutions: substitutions.length > 0 ? substitutions : null,
    instructions: moves.length > 0 ? { moves } : null,
  };
}

// ============================================================================
// Hydration (server → client draft)
// ============================================================================

/**
 * Convert a backend `TacticsResDto` into a `HydratePayload` for the reducer.
 * The reducer's HYDRATE action separates pitch/bench slots internally.
 *
 * Accepts `null` to return a sensible empty draft (no tactics submitted yet).
 */
export function hydrateTactics(
  tactics:
    | {
        formation: string;
        lineup: Record<string, string>;
        tempo: 'slow' | 'balanced' | 'fast';
        pitchWidth: 'narrow' | 'balanced' | 'wide';
        defensiveLine: 'low' | 'mid' | 'high';
        substitutions: Array<{ minute: number; out: string; in: string }> | null;
        instructions: { moves?: Array<{ minute: number; player: string; position: string }> } | null;
        presetId: string | null;
      }
    | null,
): HydratePayload {
  if (!tactics) {
    return {
      lineup: {},
      tempo: 'balanced',
      pitchWidth: 'balanced',
      defensiveLine: 'mid',
      substitutions: null,
      instructions: null,
      presetId: null,
    };
  }
  return {
    lineup: tactics.lineup,
    tempo: tactics.tempo,
    pitchWidth: tactics.pitchWidth,
    defensiveLine: tactics.defensiveLine,
    substitutions: tactics.substitutions,
    instructions: tactics.instructions,
    presetId: tactics.presetId,
  };
}

export function hydratePreset(preset: {
  id: string;
  name: string;
  isDefault: boolean;
  formation: string;
  lineup: Record<string, string>;
  substitutions: Array<{ minute: number; out: string; in: string }> | null;
  instructions: { moves?: Array<{ minute: number; player: string; position: string }> } | null;
}): PresetPayload {
  return {
    id: preset.id,
    name: preset.name,
    isDefault: preset.isDefault,
    formation: preset.formation,
    lineup: preset.lineup,
    substitutions: preset.substitutions,
    instructions: preset.instructions,
  };
}

// ============================================================================
// Re-exports
// ============================================================================

export type { PositionKey };
