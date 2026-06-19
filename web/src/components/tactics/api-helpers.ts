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

import type { TacticsDraft, TacticalEvent, PositionKey, PitchSlot, BenchSlot } from './types';
import { ALL_POSITION_KEY_SET, BENCH_SLOT_SET, PITCH_SLOT_SET } from './types';
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
  substitutions: Array<{ minute: number; out: string; in: string; condition?: string }>;
  instructions: { moves: Array<{ minute: number; player: string; position: string; condition?: string }> };
  presetId: string | null;
}

export interface CreatePresetPayload {
  name: string;
  formation: string;
  lineup: Record<string, string>;
  isDefault: boolean;
  substitutions: Array<{ minute: number; out: string; in: string; condition?: string }> | null;
  instructions: { moves: Array<{ minute: number; player: string; position: string; condition?: string }> } | null;
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
    // `always` is the implicit default — skip it to keep payloads small.
    const cond = e.condition && e.condition !== 'always' ? e.condition : undefined;
    if (e.kind === 'sub') {
      const entry: { minute: number; out: string; in: string; condition?: string } = {
        minute: e.minute,
        out: e.outId,
        in: e.inId,
      };
      if (cond) entry.condition = cond;
      substitutions.push(entry);
    } else {
      const entry: { minute: number; player: string; position: string; condition?: string } = {
        minute: e.minute,
        player: e.playerId,
        position: e.toSlot as string,
      };
      if (cond) entry.condition = cond;
      moves.push(entry);
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
 * Legacy short position codes that older auto-generated lineups / presets /
 * match instructions may still carry. We map them onto the canonical slot
 * keys the editor understands so existing seeded data hydrates cleanly.
 *
 * The mapping is intentionally idempotent: any canonical key that is
 * already valid is returned unchanged.
 */
const LEGACY_SLOT_ALIASES: Readonly<Record<string, PitchSlot>> = {
  // Defense
  CB: 'CB1',
  CDL: 'CB1',
  CDR: 'CB3',
  CD: 'CB2',
  // Midfield
  CM: 'CM1',
  CML: 'CM1',
  CMR: 'CM3',
  DM: 'DMF1',
  DML: 'DMF1',
  DMR: 'DMF3',
  CDM: 'DMF2',
  AM: 'CAM1',
  AML: 'CAM1',
  AMR: 'CAM3',
  CAM: 'CAM2',
  // Forwards
  ST: 'CF',
  // Wide positions
  WML: 'LM',
  WMR: 'RM',
  WB: 'LWB',
  WBL: 'LWB',
  WBR: 'RWB',
};

/**
 * Coerce a server-provided slot key into a valid pitch slot. Returns
 * `null` for keys we cannot map (caller decides whether to drop or surface).
 */
function toPitchSlot(raw: string): PitchSlot | null {
  if (PITCH_SLOT_SET.has(raw as PitchSlot)) return raw as PitchSlot;
  const aliased = LEGACY_SLOT_ALIASES[raw];
  return aliased ?? null;
}

/**
 * Coerce a server-provided move-target slot into a valid position key.
 * Falls back to `CF` for the common `ST` case; returns `null` only for
 * keys we genuinely cannot interpret.
 */
function toPositionKey(raw: string): PositionKey | null {
  if (ALL_POSITION_KEY_SET.has(raw as PositionKey)) return raw as PositionKey;
  const aliased = LEGACY_SLOT_ALIASES[raw];
  if (aliased) return aliased;
  return null;
}

/**
 * Normalize a raw lineup map (slot → playerId) from the server:
 *   - map legacy short codes to canonical slot keys
 *   - drop bench entries that cannot be interpreted
 *   - drop pitch entries that cannot be interpreted
 *
 * Exported for unit tests and reuse in the preset hydration path.
 */
export function normalizeLineup(
  raw: Record<string, string>,
): { pitch: Partial<Record<PitchSlot, string>>; bench: Partial<Record<BenchSlot, string>> } {
  const pitch: Partial<Record<PitchSlot, string>> = {};
  const bench: Partial<Record<BenchSlot, string>> = {};
  for (const [key, playerId] of Object.entries(raw)) {
    if (!playerId) continue;
    if (key.startsWith('BENCH_')) {
      if (BENCH_SLOT_SET.has(key as BenchSlot)) bench[key as BenchSlot] = playerId;
      continue;
    }
    const slot = toPitchSlot(key);
    if (slot) pitch[slot] = playerId;
  }
  return { pitch, bench };
}

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
        substitutions: Array<{ minute: number; out: string; in: string; condition?: string }> | null;
        instructions: { moves?: Array<{ minute: number; player: string; position: string; condition?: string }> } | null;
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
  // Flatten normalized pitch + bench into the single slot→playerId map
  // expected by the reducer's HYDRATE action.
  const { pitch, bench } = normalizeLineup(tactics.lineup);
  const lineup: Record<string, string> = { ...pitch, ...bench };

  // Normalize move instructions (legacy short position codes → canonical).
  // Drop unrecognised slots so the validator doesn't see them; emit `null`
  // when nothing survives (rather than `{ moves: [] }`) so the editor starts
  // from a clean state.
  const rawMoves = tactics.instructions?.moves ?? [];
  const moves: Array<{ minute: number; player: string; position: string; condition?: string }> = [];
  for (const m of rawMoves) {
    const slot = toPositionKey(m.position);
    if (slot) {
      const entry: { minute: number; player: string; position: string; condition?: string } = {
        minute: m.minute,
        player: m.player,
        position: slot,
      };
      if (m.condition) entry.condition = m.condition;
      moves.push(entry);
    }
  }

  // Pass through substitutions verbatim (they already use backend keys),
  // including the optional condition field.
  const substitutions = tactics.substitutions;

  return {
    lineup,
    tempo: tactics.tempo,
    pitchWidth: tactics.pitchWidth,
    defensiveLine: tactics.defensiveLine,
    substitutions,
    instructions: moves.length > 0 ? { moves } : null,
    presetId: tactics.presetId,
  };
}

export function hydratePreset(preset: {
  id: string;
  name: string;
  isDefault: boolean;
  formation: string;
  lineup: Record<string, string>;
  substitutions: Array<{ minute: number; out: string; in: string; condition?: string }> | null;
  instructions: { moves?: Array<{ minute: number; player: string; position: string; condition?: string }> } | null;
}): PresetPayload {
  // Normalize preset lineups too — old presets saved with short codes
  // would otherwise re-introduce invalidSlot errors when re-applied.
  const { pitch, bench } = normalizeLineup(preset.lineup);
  const lineup: Record<string, string> = { ...pitch, ...bench };

  const rawMoves = preset.instructions?.moves ?? [];
  const moves: Array<{ minute: number; player: string; position: string; condition?: string }> = [];
  for (const m of rawMoves) {
    const slot = toPositionKey(m.position);
    if (slot) {
      const entry: { minute: number; player: string; position: string; condition?: string } = {
        minute: m.minute,
        player: m.player,
        position: slot,
      };
      if (m.condition) entry.condition = m.condition;
      moves.push(entry);
    }
  }

  return {
    id: preset.id,
    name: preset.name,
    isDefault: preset.isDefault,
    formation: preset.formation,
    lineup,
    substitutions: preset.substitutions,
    instructions: moves.length > 0 ? { moves } : null,
  };
}

// ============================================================================
// Re-exports
// ============================================================================

export type { PositionKey };
