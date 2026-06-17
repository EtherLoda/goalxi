/**
 * use-tactics-state.spec.ts — unit tests for the pure reducer + selectors.
 * Target: ≥ 85% statement + branch coverage.
 */

import {
  reducer,
  createInitialState,
  computeLockState,
  selectFormation,
  selectIsGkPlaced,
  selectUnassignedPlayerIds,
  type HydratePayload,
  type PresetPayload,
} from './use-tactics-state';
import { createEmptyDraft, type EditorState, type LockState, type TacticsDraft } from './types';
import type { ValidationContext, ValidatorPlayer } from './lineup-validator';

// ============================================================================
// Fixtures
// ============================================================================

const TEAM_PLAYER_IDS = new Set<string>([
  'p-gk', 'p-cb-1', 'p-cb-2', 'p-cb-3', 'p-lb', 'p-rb',
  'p-cmf-1', 'p-cmf-2', 'p-cmf-3', 'p-lm', 'p-rm',
  'p-cf-1', 'p-cf-2', 'p-cf-3', 'p-bench-1', 'p-bench-2',
]);

function makePlayersById(): Map<string, ValidatorPlayer> {
  const m = new Map<string, ValidatorPlayer>();
  m.set('p-gk', { id: 'p-gk', isGoalkeeper: true, name: 'GK' });
  for (const id of TEAM_PLAYER_IDS) {
    if (id === 'p-gk') continue;
    m.set(id, { id, isGoalkeeper: false, name: id });
  }
  return m;
}

function makeValidationCtx(draft: TacticsDraft): ValidationContext {
  return {
    draft,
    teamPlayerIds: TEAM_PLAYER_IDS,
    playersById: makePlayersById(),
  };
}

function freshState(): EditorState {
  return createInitialState({
    isLocked: false,
    countdownSeconds: 60 * 60,
    matchStatus: 'scheduled',
  });
}

function makeHydratePayload(overrides: Partial<HydratePayload> = {}): HydratePayload {
  return {
    lineup: {
      GK: 'p-gk',
      CB1: 'p-cb-1',
      CB2: 'p-cb-2',
      CB3: 'p-cb-3',
      LB: 'p-lb',
      RB: 'p-rb',
      CM1: 'p-cmf-1',
      CM2: 'p-cmf-2',
      CM3: 'p-cmf-3',
      CFL: 'p-cf-1',
      CFR: 'p-cf-2',
    },
    tempo: 'balanced',
    pitchWidth: 'balanced',
    defensiveLine: 'mid',
    substitutions: null,
    instructions: null,
    presetId: null,
    ...overrides,
  };
}

// ============================================================================
// HYDRATE
// ============================================================================

describe('reducer — HYDRATE', () => {
  it('populates lineup, tempo, dimensions, and resets isDirty to false', () => {
    const payload = makeHydratePayload();
    const next = reducer(freshState(), { type: 'HYDRATE', payload });
    expect(next.draft.lineup.GK).toBe('p-gk');
    expect(next.draft.tempo).toBe('balanced');
    expect(next.draft.pitchWidth).toBe('balanced');
    expect(next.draft.defensiveLine).toBe('mid');
    expect(next.draft.isDirty).toBe(false);
  });

  it('separates pitch slots from bench slots', () => {
    const payload = makeHydratePayload({
      lineup: {
        GK: 'p-gk', CB1: 'p-cb-1', CB2: 'p-cb-2', CB3: 'p-cb-3', LB: 'p-lb', RB: 'p-rb',
        CM1: 'p-cmf-1', CM2: 'p-cmf-2', CM3: 'p-cmf-3', CFL: 'p-cf-1', CFR: 'p-cf-2',
        BENCH_GK: 'p-bench-1',
        BENCH_CB: 'p-bench-2',
      },
    });
    const next = reducer(freshState(), { type: 'HYDRATE', payload });
    expect(next.draft.bench.BENCH_GK).toBe('p-bench-1');
    expect(next.draft.bench.BENCH_CB).toBe('p-bench-2');
    expect(Object.keys(next.draft.lineup)).not.toContain('BENCH_GK');
  });

  it('hydrates substitutions into sub events', () => {
    const payload = makeHydratePayload({
      substitutions: [
        { minute: 60, out: 'p-cmf-1', in: 'p-bench-1' },
        { minute: 75, out: 'p-cf-1', in: 'p-cf-3' },
      ],
    });
    const next = reducer(freshState(), { type: 'HYDRATE', payload });
    expect(next.draft.events).toHaveLength(2);
    expect(next.draft.events[0]).toEqual({ kind: 'sub', minute: 60, outId: 'p-cmf-1', inId: 'p-bench-1' });
  });

  it('hydrates moves from instructions into move events', () => {
    const payload = makeHydratePayload({
      instructions: {
        moves: [
          { minute: 50, player: 'p-cmf-1', position: 'CAM1' },
        ],
      },
    });
    const next = reducer(freshState(), { type: 'HYDRATE', payload });
    expect(next.draft.events).toContainEqual({
      kind: 'move', minute: 50, playerId: 'p-cmf-1', toSlot: 'CAM1',
    });
  });

  it('sorts events by minute ascending', () => {
    const payload = makeHydratePayload({
      substitutions: [
        { minute: 80, out: 'p-cmf-1', in: 'p-bench-1' },
        { minute: 30, out: 'p-cf-1', in: 'p-cf-3' },
      ],
    });
    const next = reducer(freshState(), { type: 'HYDRATE', payload });
    expect(next.draft.events[0]!.minute).toBe(30);
    expect(next.draft.events[1]!.minute).toBe(80);
  });
});

// ============================================================================
// ASSIGN
// ============================================================================

describe('reducer — ASSIGN_PITCH / ASSIGN_BENCH', () => {
  it('places a player in the target pitch slot', () => {
    const state = freshState();
    const next = reducer(state, {
      type: 'ASSIGN_PITCH', from: null, to: 'GK', playerId: 'p-gk',
    });
    expect(next.draft.lineup.GK).toBe('p-gk');
    expect(next.draft.isDirty).toBe(true);
  });

  it('removes from source when assigned from another pitch slot', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'CB1', playerId: 'p-cb-1' });
    const next = reducer(state, { type: 'ASSIGN_PITCH', from: 'CB1', to: 'CB2', playerId: 'p-cb-1' });
    expect(next.draft.lineup.CB1).toBeUndefined();
    expect(next.draft.lineup.CB2).toBe('p-cb-1');
  });

  it('removes from bench when assigned from bench', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_BENCH', from: null, to: 'BENCH_CB', playerId: 'p-cb-1' });
    const next = reducer(state, { type: 'ASSIGN_PITCH', from: 'BENCH_CB', to: 'CB1', playerId: 'p-cb-1' });
    expect(next.draft.bench.BENCH_CB).toBeUndefined();
    expect(next.draft.lineup.CB1).toBe('p-cb-1');
  });

  it('clears stale duplicate of the same player elsewhere on the pitch', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'CB1', playerId: 'p-cb-1' });
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'CB2', playerId: 'p-cb-1' });
    const next = reducer(state, { type: 'ASSIGN_PITCH', from: 'CB2', to: 'CB3', playerId: 'p-cb-1' });
    expect(next.draft.lineup.CB1).toBeUndefined();
    expect(next.draft.lineup.CB2).toBeUndefined();
    expect(next.draft.lineup.CB3).toBe('p-cb-1');
  });

  it('clears stale duplicate on bench when moving to bench', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_BENCH', from: null, to: 'BENCH_CB', playerId: 'p-cb-1' });
    const next = reducer(state, { type: 'ASSIGN_BENCH', from: 'BENCH_CB', to: 'BENCH_FB', playerId: 'p-cb-1' });
    expect(next.draft.bench.BENCH_CB).toBeUndefined();
    expect(next.draft.bench.BENCH_FB).toBe('p-cb-1');
  });
});

// ============================================================================
// REMOVE
// ============================================================================

describe('reducer — REMOVE', () => {
  it('removes a pitch slot assignment and marks dirty', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'GK', playerId: 'p-gk' });
    const next = reducer(state, { type: 'REMOVE', slot: 'GK' });
    expect(next.draft.lineup.GK).toBeUndefined();
    expect(next.draft.isDirty).toBe(true);
  });

  it('removes a bench slot assignment', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_BENCH', from: null, to: 'BENCH_CB', playerId: 'p-cb-1' });
    const next = reducer(state, { type: 'REMOVE', slot: 'BENCH_CB' });
    expect(next.draft.bench.BENCH_CB).toBeUndefined();
  });

  it('does not mutate previous state (immutability)', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'GK', playerId: 'p-gk' });
    const before = state;
    reducer(state, { type: 'REMOVE', slot: 'GK' });
    // Original state should be unchanged
    expect(before.draft.lineup.GK).toBe('p-gk');
  });
});

// ============================================================================
// Events
// ============================================================================

describe('reducer — events', () => {
  it('ADD_EVENT inserts and sorts', () => {
    let state = freshState();
    state = reducer(state, { type: 'ADD_EVENT', event: { kind: 'sub', minute: 70, outId: 'a', inId: 'b' } });
    state = reducer(state, { type: 'ADD_EVENT', event: { kind: 'sub', minute: 30, outId: 'c', inId: 'd' } });
    expect(state.draft.events[0]!.minute).toBe(30);
    expect(state.draft.events[1]!.minute).toBe(70);
    expect(state.draft.isDirty).toBe(true);
  });

  it('UPDATE_EVENT patches an existing event', () => {
    let state = freshState();
    state = reducer(state, { type: 'ADD_EVENT', event: { kind: 'sub', minute: 60, outId: 'a', inId: 'b' } });
    const next = reducer(state, { type: 'UPDATE_EVENT', index: 0, patch: { minute: 80 } });
    expect(next.draft.events[0]!.minute).toBe(80);
  });

  it('REMOVE_EVENT deletes by index', () => {
    let state = freshState();
    state = reducer(state, { type: 'ADD_EVENT', event: { kind: 'sub', minute: 60, outId: 'a', inId: 'b' } });
    const next = reducer(state, { type: 'REMOVE_EVENT', index: 0 });
    expect(next.draft.events).toHaveLength(0);
  });
});

// ============================================================================
// SET_DIMENSION
// ============================================================================

describe('reducer — SET_DIMENSION', () => {
  it('updates tempo', () => {
    const next = reducer(freshState(), { type: 'SET_DIMENSION', key: 'tempo', value: 'fast' });
    expect(next.draft.tempo).toBe('fast');
    expect(next.draft.isDirty).toBe(true);
  });

  it('updates pitchWidth', () => {
    const next = reducer(freshState(), { type: 'SET_DIMENSION', key: 'pitchWidth', value: 'wide' });
    expect(next.draft.pitchWidth).toBe('wide');
  });

  it('updates defensiveLine', () => {
    const next = reducer(freshState(), { type: 'SET_DIMENSION', key: 'defensiveLine', value: 'high' });
    expect(next.draft.defensiveLine).toBe('high');
  });
});

// ============================================================================
// SET_PRESET
// ============================================================================

describe('reducer — SET_PRESET', () => {
  it('updates activePresetId without marking dirty', () => {
    const next = reducer(freshState(), { type: 'SET_PRESET', id: 'preset-123' });
    expect(next.draft.activePresetId).toBe('preset-123');
    expect(next.draft.isDirty).toBe(false);
  });

  it('clears with null', () => {
    let state = freshState();
    state = reducer(state, { type: 'SET_PRESET', id: 'p1' });
    const next = reducer(state, { type: 'SET_PRESET', id: null });
    expect(next.draft.activePresetId).toBeNull();
  });
});

// ============================================================================
// TICK_LOCK
// ============================================================================

describe('reducer — TICK_LOCK', () => {
  const scheduledAt = new Date('2026-12-01T12:00:00Z').toISOString();
  const lockAt = new Date('2026-12-01T11:30:00Z').getTime();

  it('returns same state when countdown + lock status unchanged', () => {
    let state = freshState();
    state = { ...state, lock: { isLocked: false, countdownSeconds: 3600, matchStatus: 'scheduled' } };
    // now must satisfy (lockAt - now) / 1000 == 3600
    const now = lockAt - 3600 * 1000;
    const next = reducer(state, { type: 'TICK_LOCK', now, scheduledAt });
    expect(next).toBe(state);
  });

  it('updates countdown when time advances', () => {
    let state = freshState();
    state = { ...state, lock: { isLocked: false, countdownSeconds: 3600, matchStatus: 'scheduled' } };
    const next = reducer(state, { type: 'TICK_LOCK', now: lockAt - 500, scheduledAt });
    expect(next.lock.countdownSeconds).toBeLessThan(3600);
  });

  it('locks when countdown reaches 0', () => {
    let state = freshState();
    state = { ...state, lock: { isLocked: false, countdownSeconds: 1, matchStatus: 'scheduled' } };
    const next = reducer(state, { type: 'TICK_LOCK', now: lockAt + 100, scheduledAt });
    expect(next.lock.isLocked).toBe(true);
    expect(next.lock.countdownSeconds).toBe(0);
  });

  it('stays locked if matchStatus is not scheduled', () => {
    let state = freshState();
    state = { ...state, lock: { isLocked: true, countdownSeconds: 0, matchStatus: 'in_progress' } };
    const next = reducer(state, { type: 'TICK_LOCK', now: Date.now(), scheduledAt });
    expect(next.lock.isLocked).toBe(true);
  });
});

// ============================================================================
// SUBMIT lifecycle
// ============================================================================

describe('reducer — submit lifecycle', () => {
  it('SUBMIT_START sets isSubmitting=true', () => {
    const next = reducer(freshState(), { type: 'SUBMIT_START' });
    expect(next.submit.isSubmitting).toBe(true);
    expect(next.submit.error).toBeNull();
  });

  it('SUBMIT_OK clears submitting and resets isDirty', () => {
    let state = freshState();
    state = { ...state, draft: { ...state.draft, isDirty: true } };
    state = reducer(state, { type: 'SUBMIT_START' });
    const next = reducer(state, { type: 'SUBMIT_OK' });
    expect(next.submit.isSubmitting).toBe(false);
    expect(next.draft.isDirty).toBe(false);
  });

  it('SUBMIT_ERR stores error message', () => {
    let state = freshState();
    state = reducer(state, { type: 'SUBMIT_START' });
    const next = reducer(state, { type: 'SUBMIT_ERR', message: 'bad request' });
    expect(next.submit.isSubmitting).toBe(false);
    expect(next.submit.error).toBe('bad request');
  });
});

// ============================================================================
// APPLY_PRESET
// ============================================================================

describe('reducer — APPLY_PRESET', () => {
  it('replaces draft with preset content and sets activePresetId', () => {
    const preset: PresetPayload = {
      id: 'preset-A',
      name: 'Aggressive',
      isDefault: false,
      formation: '4-3-3',
      lineup: { GK: 'p-gk', CB1: 'p-cb-1', CB2: 'p-cb-2', CB3: 'p-cb-3', LB: 'p-lb', RB: 'p-rb', CM1: 'p-cmf-1', CM2: 'p-cmf-2', CM3: 'p-cmf-3', LW: 'p-cf-1', RW: 'p-cf-2' },
      substitutions: [{ minute: 60, out: 'p-cmf-1', in: 'p-bench-1' }],
      instructions: null,
    };
    const next = reducer(freshState(), { type: 'APPLY_PRESET', preset });
    expect(next.draft.lineup.CF).toBeUndefined();
    expect(next.draft.lineup.LW).toBe('p-cf-1');
    expect(next.draft.activePresetId).toBe('preset-A');
    expect(next.draft.isDirty).toBe(false);
    expect(next.draft.events).toHaveLength(1);
  });

  it('preserves current tempo/width/line when applying preset', () => {
    let state = freshState();
    state = { ...state, draft: { ...state.draft, tempo: 'fast', pitchWidth: 'wide' } };
    const next = reducer(state, {
      type: 'APPLY_PRESET',
      preset: {
        id: 'p1', name: 'x', isDefault: false, formation: '4-4-2',
        lineup: { GK: 'p-gk' },
        substitutions: null,
        instructions: null,
      },
    });
    expect(next.draft.tempo).toBe('fast');
    expect(next.draft.pitchWidth).toBe('wide');
  });
});

// ============================================================================
// REVALIDATE
// ============================================================================

describe('reducer — REVALIDATE', () => {
  it('updates validation when draft changes', () => {
    let state = freshState();
    state = reducer(state, { type: 'ASSIGN_PITCH', from: null, to: 'GK', playerId: 'p-gk' });
    const ctx = makeValidationCtx(state.draft);
    const next = reducer(state, { type: 'REVALIDATE', ctx });
    // 1 player → invalid count, but GK is present
    expect(next.validation.isValid).toBe(false);
  });

  it('returns same state when validation result is unchanged', () => {
    const state = freshState();
    const ctx = makeValidationCtx(state.draft);
    const once = reducer(state, { type: 'REVALIDATE', ctx });
    const twice = reducer(once, { type: 'REVALIDATE', ctx });
    expect(twice).toBe(once);
  });
});

// ============================================================================
// Initial state
// ============================================================================

describe('createInitialState', () => {
  it('starts with empty draft and provided lock state', () => {
    const lock: LockState = { isLocked: true, countdownSeconds: 0, matchStatus: 'in_progress' };
    const state = createInitialState(lock);
    expect(state.draft).toEqual(createEmptyDraft());
    expect(state.lock).toBe(lock);
    expect(state.validation.isValid).toBe(false);
  });
});

// ============================================================================
// computeLockState
// ============================================================================

describe('computeLockState', () => {
  it('unlocked when scheduled 60 min from now', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const lock = computeLockState('scheduled', future, Date.now());
    expect(lock.isLocked).toBe(false);
    expect(lock.countdownSeconds).toBeGreaterThan(0);
  });

  it('locked when within 30 min of scheduled', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const lock = computeLockState('scheduled', future, Date.now());
    expect(lock.isLocked).toBe(true);
  });

  it('locked when match status is in_progress regardless of time', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const lock = computeLockState('in_progress', future, Date.now());
    expect(lock.isLocked).toBe(true);
  });
});

// ============================================================================
// Selectors
// ============================================================================

describe('selectFormation', () => {
  it('returns 4-4-2 for a 4-4-2 layout', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: {
        GK: 'p-gk',
        LB: 'p-lb', CB1: 'p-cb-1', CB2: 'p-cb-2', RB: 'p-rb',
        LM: 'p-lm', CM1: 'p-cmf-1', CM2: 'p-cmf-2', RM: 'p-rm',
        CFL: 'p-cf-1', CFR: 'p-cf-2',
      },
    };
    expect(selectFormation(draft)).toBe('4-4-2');
  });

  it('returns 0-0-0 for empty lineup', () => {
    expect(selectFormation(createEmptyDraft())).toBe('0-0-0');
  });

  it('returns 5-3-2 for a 3-5-2 layout (wing-backs counted as defenders)', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: {
        GK: 'p-gk',
        CB1: 'a', CB2: 'b', CB3: 'c',
        LWB: 'd', CM1: 'e', CM2: 'f', CM3: 'g', RWB: 'h',
        CFL: 'i', CFR: 'j',
      },
    };
    expect(selectFormation(draft)).toBe('5-3-2');
  });
});

describe('selectIsGkPlaced', () => {
  it('true when GK assigned', () => {
    expect(selectIsGkPlaced({ ...createEmptyDraft(), lineup: { GK: 'p-gk' } })).toBe(true);
  });

  it('false when GK missing', () => {
    expect(selectIsGkPlaced(createEmptyDraft())).toBe(false);
  });
});

describe('selectUnassignedPlayerIds', () => {
  it('returns the difference between all players and assigned', () => {
    const draft: TacticsDraft = { ...createEmptyDraft(), lineup: { GK: 'p-gk' } };
    const result = selectUnassignedPlayerIds(draft, ['p-gk', 'p-cb-1', 'p-cb-2']);
    expect(result).toEqual(['p-cb-1', 'p-cb-2']);
  });

  it('excludes bench-assigned players too', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: { GK: 'p-gk' },
      bench: { BENCH_CB: 'p-cb-1' },
    };
    const result = selectUnassignedPlayerIds(draft, ['p-gk', 'p-cb-1', 'p-cb-2']);
    expect(result).toEqual(['p-cb-2']);
  });
});
