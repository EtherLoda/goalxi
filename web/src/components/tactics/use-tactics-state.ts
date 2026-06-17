/**
 * use-tactics-state.ts — useReducer + selectors for the tactics editor.
 *
 * The reducer is pure (no React imports) so it can be unit-tested directly.
 * The `useTacticsState` hook wires it up with an initial state and exposes
 * dispatch + memoized helpers.
 */

import { useCallback, useMemo, useReducer } from 'react';
import {
  type BenchSlot,
  type DefensiveLineValue,
  type EditorState,
  type LineupMap,
  type LockState,
  type PitchSlot,
  type PitchWidthValue,
  type PositionKey,
  type TacticalEvent,
  type TacticsDraft,
  type TempoValue,
  createEmptyDraft,
  LOCK_THRESHOLD_MINUTES,
  sortEventsByMinute,
} from './types';
import {
  type ValidationContext,
  type ValidationResult,
  validateLineup,
} from './lineup-validator';

// ============================================================================
// Hydration payload
// ============================================================================

/**
 * Shape of a single team's tactics as returned by the backend
 * `GET /matches/:matchId/tactics` endpoint, slimmed for hydration.
 */
export interface HydratePayload {
  lineup: Record<string, string>;        // slot → playerId
  tempo: TempoValue;
  pitchWidth: PitchWidthValue;
  defensiveLine: DefensiveLineValue;
  substitutions: Array<{ minute: number; out: string; in: string }> | null;
  instructions: { moves?: Array<{ minute: number; player: string; position: string }> } | null;
  presetId: string | null;
}

export interface PresetPayload {
  id: string;
  name: string;
  isDefault: boolean;
  formation: string;
  lineup: Record<string, string>;
  substitutions: Array<{ minute: number; out: string; in: string }> | null;
  instructions: { moves?: Array<{ minute: number; player: string; position: string }> } | null;
}

// ============================================================================
// Actions
// ============================================================================

export type Action =
  | { type: 'HYDRATE'; payload: HydratePayload }
  | { type: 'ASSIGN_PITCH'; from: PositionKey | null; to: PitchSlot; playerId: string }
  | { type: 'ASSIGN_BENCH'; from: PositionKey | null; to: BenchSlot; playerId: string }
  | { type: 'REMOVE'; slot: PositionKey }
  | { type: 'ADD_EVENT'; event: TacticalEvent }
  | { type: 'UPDATE_EVENT'; index: number; patch: Partial<TacticalEvent> }
  | { type: 'REMOVE_EVENT'; index: number }
  | { type: 'SET_DIMENSION'; key: 'tempo' | 'pitchWidth' | 'defensiveLine'; value: TempoValue | PitchWidthValue | DefensiveLineValue }
  | { type: 'SET_PRESET'; id: string | null }
  | { type: 'TICK_LOCK'; now: number; scheduledAt: string }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_OK' }
  | { type: 'SUBMIT_ERR'; message: string }
  | { type: 'APPLY_PRESET'; preset: PresetPayload }
  | { type: 'REVALIDATE'; ctx: ValidationContext };

// ============================================================================
// Initial state factory
// ============================================================================

export function createInitialState(
  initialLock: LockState,
): EditorState {
  return {
    draft: createEmptyDraft(),
    lock: initialLock,
    validation: { errors: [], isValid: false },
    submit: { isSubmitting: false, error: null },
  };
}

/** Compute the initial lock state from a match's scheduled time + status. */
export function computeLockState(
  matchStatus: EditorState['lock']['matchStatus'],
  scheduledAtIso: string,
  nowMs: number = Date.now(),
): LockState {
  const scheduledMs = new Date(scheduledAtIso).getTime();
  const lockMs = scheduledMs - LOCK_THRESHOLD_MINUTES * 60 * 1000;
  const countdownSeconds = Math.max(0, Math.floor((lockMs - nowMs) / 1000));
  const isLocked = matchStatus !== 'scheduled' || nowMs >= lockMs;
  return {
    isLocked,
    countdownSeconds,
    matchStatus,
  };
}

// ============================================================================
// Reducer
// ============================================================================

export function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'HYDRATE': {
      const { payload } = action;
      const lineup: LineupMap = {};
      const bench: Partial<Record<BenchSlot, string>> = {};
      for (const [slot, playerId] of Object.entries(payload.lineup)) {
        if (slot.startsWith('BENCH_')) {
          bench[slot as BenchSlot] = playerId;
        } else {
          lineup[slot as PitchSlot] = playerId;
        }
      }
      const events: TacticalEvent[] = [];
      if (payload.substitutions) {
        for (const s of payload.substitutions) {
          events.push({ kind: 'sub', minute: s.minute, outId: s.out, inId: s.in });
        }
      }
      if (payload.instructions?.moves) {
        for (const m of payload.instructions.moves) {
          events.push({ kind: 'move', minute: m.minute, playerId: m.player, toSlot: m.position as PositionKey });
        }
      }
      return {
        ...state,
        draft: {
          lineup,
          bench,
          events: sortEventsByMinute(events),
          tempo: payload.tempo,
          pitchWidth: payload.pitchWidth,
          defensiveLine: payload.defensiveLine,
          activePresetId: payload.presetId,
          isDirty: false,
        },
      };
    }

    case 'ASSIGN_PITCH': {
      const { from, to, playerId } = action;
      return movePlayer(state, from, to, playerId, 'pitch');
    }

    case 'ASSIGN_BENCH': {
      const { from, to, playerId } = action;
      return movePlayer(state, from, to, playerId, 'bench');
    }

    case 'REMOVE': {
      const { slot } = action;
      if (slot.startsWith('BENCH_')) {
        const bench = { ...state.draft.bench };
        delete bench[slot as BenchSlot];
        return markDirty({ ...state, draft: { ...state.draft, bench } });
      }
      const lineup = { ...state.draft.lineup };
      delete lineup[slot as PitchSlot];
      return markDirty({ ...state, draft: { ...state.draft, lineup } });
    }

    case 'ADD_EVENT': {
      const events = sortEventsByMinute([...state.draft.events, action.event]);
      return markDirty({ ...state, draft: { ...state.draft, events } });
    }

    case 'UPDATE_EVENT': {
      const events = state.draft.events.map((e, i) => {
        if (i !== action.index) return e;
        return { ...e, ...action.patch } as TacticalEvent;
      });
      return markDirty({ ...state, draft: { ...state.draft, events: sortEventsByMinute(events) } });
    }

    case 'REMOVE_EVENT': {
      const events = state.draft.events.filter((_, i) => i !== action.index);
      return markDirty({ ...state, draft: { ...state.draft, events } });
    }

    case 'SET_DIMENSION': {
      const draft = { ...state.draft, [action.key]: action.value };
      return markDirty({ ...state, draft: draft as TacticsDraft });
    }

    case 'SET_PRESET': {
      return { ...state, draft: { ...state.draft, activePresetId: action.id } };
    }

    case 'TICK_LOCK': {
      const scheduledMs = new Date(action.scheduledAt).getTime();
      const lockMs = scheduledMs - LOCK_THRESHOLD_MINUTES * 60 * 1000;
      const countdownSeconds = Math.max(0, Math.floor((lockMs - action.now) / 1000));
      const isLocked = state.lock.matchStatus !== 'scheduled' || action.now >= lockMs;
      if (
        state.lock.countdownSeconds === countdownSeconds &&
        state.lock.isLocked === isLocked
      ) {
        return state;
      }
      return { ...state, lock: { ...state.lock, countdownSeconds, isLocked } };
    }

    case 'SUBMIT_START': {
      return { ...state, submit: { isSubmitting: true, error: null } };
    }

    case 'SUBMIT_OK': {
      return { ...state, submit: { isSubmitting: false, error: null }, draft: { ...state.draft, isDirty: false } };
    }

    case 'SUBMIT_ERR': {
      return { ...state, submit: { isSubmitting: false, error: action.message } };
    }

    case 'APPLY_PRESET': {
      const lineup: LineupMap = {};
      const bench: Partial<Record<BenchSlot, string>> = {};
      for (const [slot, playerId] of Object.entries(action.preset.lineup)) {
        if (slot.startsWith('BENCH_')) {
          bench[slot as BenchSlot] = playerId;
        } else {
          lineup[slot as PitchSlot] = playerId;
        }
      }
      const events: TacticalEvent[] = [];
      if (action.preset.substitutions) {
        for (const s of action.preset.substitutions) {
          events.push({ kind: 'sub', minute: s.minute, outId: s.out, inId: s.in });
        }
      }
      if (action.preset.instructions?.moves) {
        for (const m of action.preset.instructions.moves) {
          events.push({ kind: 'move', minute: m.minute, playerId: m.player, toSlot: m.position as PositionKey });
        }
      }
      return {
        ...state,
        draft: {
          lineup,
          bench,
          events: sortEventsByMinute(events),
          tempo: state.draft.tempo,
          pitchWidth: state.draft.pitchWidth,
          defensiveLine: state.draft.defensiveLine,
          activePresetId: action.preset.id,
          isDirty: false,
        },
      };
    }

    case 'REVALIDATE': {
      const result: ValidationResult = validateLineup(action.ctx);
      if (
        result.isValid === state.validation.isValid &&
        sameErrorKeys(result.errors, state.validation.errors)
      ) {
        return state;
      }
      return { ...state, validation: result };
    }
  }
}

// ============================================================================
// Internal helpers
// ============================================================================

type Destination = 'pitch' | 'bench';

function movePlayer(
  state: EditorState,
  from: PositionKey | null,
  to: PositionKey,
  playerId: string,
  destination: Destination,
): EditorState {
  const lineup = { ...state.draft.lineup };
  const bench = { ...state.draft.bench };

  // Remove from source
  if (from) {
    if (from.startsWith('BENCH_')) {
      delete bench[from as BenchSlot];
    } else {
      delete lineup[from as PitchSlot];
    }
  }

  // If player was elsewhere on the pitch/bench, clear that too (best-effort dedup)
  for (const [slot, id] of Object.entries(lineup) as [PitchSlot, string | undefined][]) {
    if (id === playerId && slot !== to) delete lineup[slot];
  }
  for (const [slot, id] of Object.entries(bench) as [BenchSlot, string | undefined][]) {
    if (id === playerId && slot !== to) delete bench[slot];
  }

  // Place at destination
  if (destination === 'pitch') {
    lineup[to as PitchSlot] = playerId;
  } else {
    bench[to as BenchSlot] = playerId;
  }

  return markDirty({ ...state, draft: { ...state.draft, lineup, bench } });
}

function markDirty(state: EditorState): EditorState {
  if (state.draft.isDirty) return state;
  return { ...state, draft: { ...state.draft, isDirty: true } };
}

function sameErrorKeys(a: { key: string }[], b: { key: string }[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.key !== b[i]!.key) return false;
  }
  return true;
}

// ============================================================================
// Selectors
// ============================================================================

export function selectFormation(draft: TacticsDraft): string {
  // Defenders: back line only (LB, CB1-3, RB, LWB, RWB). GK is excluded from this count.
  const defenders = ['LB', 'CB1', 'CB2', 'CB3', 'RB', 'LWB', 'RWB'].filter(
    (s) => draft.lineup[s as PitchSlot],
  ).length;
  // Midfielders: DMF1-3, CM1-3, CAM1-3, LM, RM
  const midfielders = ['DMF1', 'DMF2', 'DMF3', 'CM1', 'CM2', 'CM3', 'CAM1', 'CAM2', 'CAM3', 'LM', 'RM'].filter(
    (s) => draft.lineup[s as PitchSlot],
  ).length;
  // Attackers: LW, RW, CFL, CF, CFR
  const attackers = ['LW', 'RW', 'CFL', 'CF', 'CFR'].filter(
    (s) => draft.lineup[s as PitchSlot],
  ).length;
  return `${defenders}-${midfielders}-${attackers}`;
}

export function selectIsGkPlaced(draft: TacticsDraft): boolean {
  return Boolean(draft.lineup.GK);
}

export function selectUnassignedPlayerIds(
  draft: TacticsDraft,
  allPlayerIds: readonly string[],
): string[] {
  const assigned = new Set<string>();
  for (const id of Object.values(draft.lineup)) if (id) assigned.add(id);
  for (const id of Object.values(draft.bench)) if (id) assigned.add(id);
  return allPlayerIds.filter((id) => !assigned.has(id));
}

// ============================================================================
// Hook
// ============================================================================

export interface UseTacticsStateOptions {
  initialLock: LockState;
}

export interface UseTacticsStateResult {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  // Memoized selectors
  formation: string;
  isGkPlaced: boolean;
}

export function useTacticsState(opts: UseTacticsStateOptions): UseTacticsStateResult {
  const [state, dispatch] = useReducer(reducer, opts.initialLock, createInitialState);

  const formation = useMemo(() => selectFormation(state.draft), [state.draft]);
  const isGkPlaced = useMemo(() => selectIsGkPlaced(state.draft), [state.draft]);

  return useCallback(
    () => ({ state, dispatch, formation, isGkPlaced }),
    [state, formation, isGkPlaced],
  )();
}
