/**
 * types.ts — single source of truth for the tactics editor.
 *
 * Contains:
 *  - All 24 valid position keys (18 pitch + 6 bench)
 *  - Position metadata (zone, label, pitch coordinates)
 *  - Formation templates (UI helpers only — backend computes the real formation string)
 *  - Match status enum (mirrors backend `MatchStatus`)
 *  - Shared types for `TacticsDraft`, `TacticalEvent`, etc.
 *
 * IMPORTANT: This file must NOT import anything from React or the app —
 * it is consumed by both the reducer and the pure validator.
 */

// ============================================================================
// Position Keys
// ============================================================================

/** All 24 valid positions in a team lineup (18 pitch + 6 bench). */
export type PositionKey =
  // Pitch (18)
  | 'GK'
  | 'CB1'
  | 'CB2'
  | 'CB3'
  | 'LB'
  | 'RB'
  | 'LWB'
  | 'RWB'
  | 'DMF1'
  | 'DMF2'
  | 'DMF3'
  | 'CM1'
  | 'CM2'
  | 'CM3'
  | 'CAM1'
  | 'CAM2'
  | 'CAM3'
  | 'LM'
  | 'RM'
  | 'LW'
  | 'RW'
  | 'CFL'
  | 'CF'
  | 'CFR'
  // Bench (6)
  | 'BENCH_GK'
  | 'BENCH_CB'
  | 'BENCH_FB'
  | 'BENCH_W'
  | 'BENCH_CM'
  | 'BENCH_FW';

export type PitchSlot = Exclude<PositionKey, `BENCH_${string}`>;
export type BenchSlot = Extract<PositionKey, `BENCH_${string}`>;

/** All 18 pitch slots in canonical order. */
export const PITCH_SLOTS: readonly PitchSlot[] = [
  'GK',
  'LB',
  'CB1',
  'CB2',
  'CB3',
  'RB',
  'LWB',
  'RWB',
  'DMF1',
  'DMF2',
  'DMF3',
  'CM1',
  'CM2',
  'CM3',
  'CAM1',
  'CAM2',
  'CAM3',
  'LM',
  'RM',
  'LW',
  'RW',
  'CFL',
  'CF',
  'CFR',
] as const;

/** All 6 bench slots in canonical order. */
export const BENCH_SLOTS: readonly BenchSlot[] = [
  'BENCH_GK',
  'BENCH_CB',
  'BENCH_FB',
  'BENCH_W',
  'BENCH_CM',
  'BENCH_FW',
] as const;

export const ALL_POSITION_KEYS: readonly PositionKey[] = [...PITCH_SLOTS, ...BENCH_SLOTS];

/** Quick set lookup. */
export const PITCH_SLOT_SET: ReadonlySet<PitchSlot> = new Set(PITCH_SLOTS);
export const BENCH_SLOT_SET: ReadonlySet<BenchSlot> = new Set(BENCH_SLOTS);
export const ALL_POSITION_KEY_SET: ReadonlySet<PositionKey> = new Set(ALL_POSITION_KEYS);

/** Type guards. */
export function isPitchSlot(key: string): key is PitchSlot {
  return PITCH_SLOT_SET.has(key as PitchSlot);
}

export function isBenchSlot(key: string): key is BenchSlot {
  return BENCH_SLOT_SET.has(key as BenchSlot);
}

// ============================================================================
// Pitch Coordinates (0-100 relative, attacking direction = top → bottom)
// ============================================================================

/**
 * Pitch coordinates for all 18 pitch slots in default 4-3-3-ish spread.
 * The container SVG uses `viewBox="0 0 100 100"` with `preserveAspectRatio="none"`,
 * so values are interpreted as percentages of the rendered pitch area.
 *
 * Layout convention:
 *   y = 0 → opponent goal (top)
 *   y = 100 → our goal (bottom)
 *   x = 0 → left touchline, x = 100 → right touchline
 */
export const PITCH_COORDS: Readonly<Record<PitchSlot, { x: number; y: number }>> = {
  // GK at the bottom
  GK: { x: 50, y: 92 },
  // Back four / five (defenders)
  LB: { x: 12, y: 76 },
  CB1: { x: 32, y: 78 },
  CB2: { x: 50, y: 80 },
  CB3: { x: 68, y: 78 },
  RB: { x: 88, y: 76 },
  // Wing-backs (5-defender formations)
  LWB: { x: 8, y: 68 },
  RWB: { x: 92, y: 68 },
  // Defensive midfield
  DMF1: { x: 32, y: 60 },
  DMF2: { x: 50, y: 62 },
  DMF3: { x: 68, y: 60 },
  // Central midfield
  CM1: { x: 32, y: 46 },
  CM2: { x: 50, y: 44 },
  CM3: { x: 68, y: 46 },
  // Attacking midfield
  CAM1: { x: 32, y: 30 },
  CAM2: { x: 50, y: 28 },
  CAM3: { x: 68, y: 30 },
  // Wide midfield
  LM: { x: 10, y: 44 },
  RM: { x: 90, y: 44 },
  // Forwards
  LW: { x: 14, y: 18 },
  RW: { x: 86, y: 18 },
  CFL: { x: 35, y: 14 },
  CF: { x: 50, y: 10 },
  CFR: { x: 65, y: 14 },
};

// ============================================================================
// Zone Classification
// ============================================================================

export type PositionZone = 'goalkeeper' | 'defense' | 'midfield' | 'attack' | 'bench';

export const PITCH_ZONE: Readonly<Record<PitchSlot, Exclude<PositionZone, 'bench'>>> = {
  GK: 'goalkeeper',
  LB: 'defense',
  CB1: 'defense',
  CB2: 'defense',
  CB3: 'defense',
  RB: 'defense',
  LWB: 'defense',
  RWB: 'defense',
  DMF1: 'midfield',
  DMF2: 'midfield',
  DMF3: 'midfield',
  CM1: 'midfield',
  CM2: 'midfield',
  CM3: 'midfield',
  CAM1: 'midfield',
  CAM2: 'midfield',
  CAM3: 'midfield',
  LM: 'midfield',
  RM: 'midfield',
  LW: 'attack',
  RW: 'attack',
  CFL: 'attack',
  CF: 'attack',
  CFR: 'attack',
};

// ============================================================================
// Position Defs (metadata table)
// ============================================================================

export interface PositionDef {
  readonly key: PositionKey;
  readonly zone: PositionZone;
  readonly isPitch: boolean;
  /** i18n key under `tactics.position.*` for the localized label. */
  readonly labelKey: string;
}

export const POSITION_DEFS: Readonly<Record<PositionKey, PositionDef>> = {
  GK: { key: 'GK', zone: 'goalkeeper', isPitch: true, labelKey: 'tactics.position.GK' },
  CB1: { key: 'CB1', zone: 'defense', isPitch: true, labelKey: 'tactics.position.CB1' },
  CB2: { key: 'CB2', zone: 'defense', isPitch: true, labelKey: 'tactics.position.CB1' },
  CB3: { key: 'CB3', zone: 'defense', isPitch: true, labelKey: 'tactics.position.CB1' },
  LB: { key: 'LB', zone: 'defense', isPitch: true, labelKey: 'tactics.position.LB' },
  RB: { key: 'RB', zone: 'defense', isPitch: true, labelKey: 'tactics.position.RB' },
  LWB: { key: 'LWB', zone: 'defense', isPitch: true, labelKey: 'tactics.position.LWB' },
  RWB: { key: 'RWB', zone: 'defense', isPitch: true, labelKey: 'tactics.position.RWB' },
  DMF1: { key: 'DMF1', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.DMF1' },
  DMF2: { key: 'DMF2', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.DMF1' },
  DMF3: { key: 'DMF3', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.DMF1' },
  CM1: { key: 'CM1', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CM1' },
  CM2: { key: 'CM2', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CM1' },
  CM3: { key: 'CM3', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CM1' },
  CAM1: { key: 'CAM1', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CAM1' },
  CAM2: { key: 'CAM2', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CAM1' },
  CAM3: { key: 'CAM3', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.CAM1' },
  LM: { key: 'LM', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.LM' },
  RM: { key: 'RM', zone: 'midfield', isPitch: true, labelKey: 'tactics.position.RM' },
  LW: { key: 'LW', zone: 'attack', isPitch: true, labelKey: 'tactics.position.LW' },
  RW: { key: 'RW', zone: 'attack', isPitch: true, labelKey: 'tactics.position.RW' },
  CFL: { key: 'CFL', zone: 'attack', isPitch: true, labelKey: 'tactics.position.CFL' },
  CF: { key: 'CF', zone: 'attack', isPitch: true, labelKey: 'tactics.position.CF' },
  CFR: { key: 'CFR', zone: 'attack', isPitch: true, labelKey: 'tactics.position.CFR' },
  BENCH_GK: { key: 'BENCH_GK', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_GK' },
  BENCH_CB: { key: 'BENCH_CB', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_CB' },
  BENCH_FB: { key: 'BENCH_FB', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_FB' },
  BENCH_W: { key: 'BENCH_W', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_W' },
  BENCH_CM: { key: 'BENCH_CM', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_CM' },
  BENCH_FW: { key: 'BENCH_FW', zone: 'bench', isPitch: false, labelKey: 'tactics.position.BENCH_FW' },
};

// ============================================================================
// Formation Templates
// ============================================================================

/**
 * Canonical formation string → ordered pitch slot list. Used to:
 *  1. Render the formation picker UI
 *  2. Apply a formation (clear existing lineup, fill these slots)
 *
 * The backend computes the formation string from the actual lineup, so this
 * is purely a UI affordance. Counts must match backend expectations
 * (defenders - midfielders - attackers).
 */
export const FORMATION_TEMPLATES = {
  '4-4-2': ['GK', 'LB', 'CB1', 'CB2', 'RB', 'LM', 'CM1', 'CM2', 'RM', 'CFL', 'CFR'],
  '4-3-3': ['GK', 'LB', 'CB1', 'CB2', 'RB', 'CM1', 'CM2', 'CM3', 'LW', 'CF', 'RW'],
  '4-2-3-1': ['GK', 'LB', 'CB1', 'CB2', 'RB', 'DMF1', 'DMF2', 'CAM1', 'CAM2', 'CAM3', 'CF'],
  '4-1-4-1': ['GK', 'LB', 'CB1', 'CB2', 'RB', 'DMF1', 'LM', 'CM1', 'CM2', 'RM', 'CF'],
  '4-3-2-1': ['GK', 'LB', 'CB1', 'CB2', 'RB', 'CM1', 'CM2', 'CM3', 'CAM1', 'CAM2', 'CF'],
  '3-5-2': ['GK', 'CB1', 'CB2', 'CB3', 'LWB', 'CM1', 'CM2', 'CM3', 'RWB', 'CFL', 'CFR'],
  '3-4-3': ['GK', 'CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'RM', 'LW', 'CF', 'RW'],
  '3-4-2-1': ['GK', 'CB1', 'CB2', 'CB3', 'LM', 'CM1', 'CM2', 'RM', 'CAM1', 'CAM2', 'CF'],
  '5-3-2': ['GK', 'LWB', 'CB1', 'CB2', 'CB3', 'RWB', 'CM1', 'CM2', 'CM3', 'CFL', 'CFR'],
  '5-4-1': ['GK', 'LWB', 'CB1', 'CB2', 'CB3', 'RWB', 'LM', 'CM1', 'CM2', 'RM', 'CF'],
} as const satisfies Record<string, readonly PitchSlot[]>;

export type FormationKey = keyof typeof FORMATION_TEMPLATES;

export const FORMATION_KEYS: readonly FormationKey[] = Object.keys(FORMATION_TEMPLATES) as FormationKey[];

// ============================================================================
// Match Status (mirrors libs/database `MatchStatus` enum)
// ============================================================================

export type MatchStatus =
  | 'scheduled'
  | 'tactics_locked'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

// ============================================================================
// Tactical Dimensions
// ============================================================================

export type TempoValue = 'slow' | 'balanced' | 'fast';
export type PitchWidthValue = 'narrow' | 'balanced' | 'wide';
export type DefensiveLineValue = 'low' | 'mid' | 'high';

export const TEMPO_VALUES: readonly TempoValue[] = ['slow', 'balanced', 'fast'];
export const PITCH_WIDTH_VALUES: readonly PitchWidthValue[] = ['narrow', 'balanced', 'wide'];
export const DEFENSIVE_LINE_VALUES: readonly DefensiveLineValue[] = ['low', 'mid', 'high'];

// ============================================================================
// Tactical Events (substitutions + position moves)
// ============================================================================

export interface SubstitutionEvent {
  readonly kind: 'sub';
  readonly minute: number;
  readonly outId: string;
  readonly inId: string;
}

export interface MoveEvent {
  readonly kind: 'move';
  readonly minute: number;
  readonly playerId: string;
  readonly toSlot: PositionKey;
}

export type TacticalEvent = SubstitutionEvent | MoveEvent;

// ============================================================================
// Draft State
// ============================================================================

export type LineupMap = Partial<Record<PitchSlot, string | null>>;
export type BenchMap = Partial<Record<BenchSlot, string | null>>;

export interface TacticsDraft {
  lineup: LineupMap;
  bench: BenchMap;
  events: TacticalEvent[];
  tempo: TempoValue;
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  activePresetId: string | null;
  isDirty: boolean;
}

// ============================================================================
// Lock State
// ============================================================================

export interface LockState {
  /** True when the match has started or is within 30 min of kickoff. */
  isLocked: boolean;
  /** Seconds remaining until lock (or kickoff, whichever is sooner). */
  countdownSeconds: number;
  matchStatus: MatchStatus;
}

// ============================================================================
// Editor State
// ============================================================================

import type { ValidationError, ValidationResult } from './lineup-validator';

export interface EditorState {
  draft: TacticsDraft;
  lock: LockState;
  validation: ValidationResult;
  submit: { isSubmitting: boolean; error: string | null };
}

// ============================================================================
// Defaults & helpers
// ============================================================================

/** A blank draft — useful for initial state, hydration, and presets. */
export function createEmptyDraft(): TacticsDraft {
  return {
    lineup: {},
    bench: {},
    events: [],
    tempo: 'balanced',
    pitchWidth: 'balanced',
    defensiveLine: 'mid',
    activePresetId: null,
    isDirty: false,
  };
}

/** Sorted array of events by minute ascending. */
export function sortEventsByMinute(events: TacticalEvent[]): TacticalEvent[] {
  return [...events].sort((a, b) => a.minute - b.minute);
}

/** IDs currently assigned to either pitch or bench. Bench duplicates of pitch are
 *  allowed by the backend, but we surface them as a single set. */
export function collectAssignedPlayerIds(draft: TacticsDraft): Set<string> {
  const ids = new Set<string>();
  for (const id of Object.values(draft.lineup)) {
    if (id) ids.add(id);
  }
  for (const id of Object.values(draft.bench)) {
    if (id) ids.add(id);
  }
  return ids;
}

// ============================================================================
// Lock-window constants
// ============================================================================

/** Backend locks tactics submission 30 minutes before `scheduledAt`. */
export const LOCK_THRESHOLD_MINUTES = 30;

/** UI switches to amber warning state below this threshold. */
export const LOCK_WARNING_MINUTES = 5;
