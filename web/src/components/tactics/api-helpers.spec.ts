/**
 * api-helpers.spec.ts — exhaustive tests for serialization helpers.
 * Target: 100% statement + branch coverage.
 */

import {
  serializeTactics,
  serializePreset,
  hydrateTactics,
  hydratePreset,
  computeFormation,
  flattenLineup,
} from './api-helpers';
import { createEmptyDraft, type TacticsDraft } from './types';

// ============================================================================
// Fixtures
// ============================================================================

function baseDraft(overrides: Partial<TacticsDraft> = {}): TacticsDraft {
  return {
    ...createEmptyDraft(),
    lineup: {
      GK: 'p-gk',
      LB: 'p-lb', CB1: 'p-cb-1', CB2: 'p-cb-2', RB: 'p-rb',
      CM1: 'p-cmf-1', CM2: 'p-cmf-2', CM3: 'p-cmf-3',
      LW: 'p-cf-1', CF: 'p-cf-2', RW: 'p-cf-3',
    },
    bench: { BENCH_CB: 'p-bench-1' },
    tempo: 'fast',
    pitchWidth: 'wide',
    defensiveLine: 'high',
    activePresetId: 'preset-1',
    isDirty: true,
    ...overrides,
  };
}

// ============================================================================
// computeFormation
// ============================================================================

describe('computeFormation', () => {
  it('returns 4-3-3 for a 4-3-3 layout', () => {
    const lineup: TacticsDraft['lineup'] = {
      GK: 'p-gk', LB: 'a', CB1: 'b', CB2: 'c', RB: 'd',
      CM1: 'e', CM2: 'f', CM3: 'g',
      LW: 'h', CF: 'i', RW: 'j',
    };
    expect(computeFormation(lineup)).toBe('4-3-3');
  });

  it('returns 5-3-2 for a 3-5-2 layout (wing-backs counted as defenders)', () => {
    const lineup: TacticsDraft['lineup'] = {
      GK: 'p-gk', CB1: 'a', CB2: 'b', CB3: 'c',
      LWB: 'd', CM1: 'e', CM2: 'f', CM3: 'g', RWB: 'h',
      CFL: 'i', CFR: 'j',
    };
    expect(computeFormation(lineup)).toBe('5-3-2');
  });

  it('returns 0-0-0 for empty lineup', () => {
    expect(computeFormation({})).toBe('0-0-0');
  });

  it('GK is not counted in defender tally', () => {
    // Without GK, 4-3-3 layout (LB, CB1, CB2, CB3, RB) shows 5-3-3.
    // GK is separate from defender count.
    const lineup: TacticsDraft['lineup'] = {
      LB: 'a', CB1: 'b', CB2: 'c', CB3: 'd', RB: 'e',
      CM1: 'f', CM2: 'g', CM3: 'h',
      LW: 'i', CF: 'j', RW: 'k',
    };
    expect(computeFormation(lineup)).toBe('5-3-3');
  });
});

// ============================================================================
// flattenLineup
// ============================================================================

describe('flattenLineup', () => {
  it('merges pitch and bench into one map', () => {
    const draft = baseDraft();
    const flat = flattenLineup(draft);
    expect(flat['GK']).toBe('p-gk');
    expect(flat['BENCH_CB']).toBe('p-bench-1');
    expect(Object.keys(flat)).toHaveLength(12);
  });

  it('skips empty slots', () => {
    const draft = baseDraft({ lineup: { GK: 'p-gk' }, bench: {} });
    const flat = flattenLineup(draft);
    expect(flat).toEqual({ GK: 'p-gk' });
  });
});

// ============================================================================
// serializeTactics
// ============================================================================

describe('serializeTactics', () => {
  it('produces a complete SubmitTacticsPayload', () => {
    const draft = baseDraft();
    const result = serializeTactics('match-1', 'team-1', draft);
    expect(result._matchId).toBe('match-1');
    expect(result.teamId).toBe('team-1');
    expect(result.formation).toBe('4-3-3');
    expect(result.tempo).toBe('fast');
    expect(result.pitchWidth).toBe('wide');
    expect(result.defensiveLine).toBe('high');
    expect(result.presetId).toBe('preset-1');
    expect(result.lineup['GK']).toBe('p-gk');
    expect(result.lineup['BENCH_CB']).toBe('p-bench-1');
  });

  it('includes sub events in substitutions', () => {
    const draft = baseDraft({
      events: [{ kind: 'sub', minute: 60, outId: 'p-cmf-1', inId: 'p-bench-1' }],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.substitutions).toEqual([{ minute: 60, out: 'p-cmf-1', in: 'p-bench-1' }]);
  });

  it('includes move events in instructions.moves', () => {
    const draft = baseDraft({
      events: [{ kind: 'move', minute: 70, playerId: 'p-cmf-1', toSlot: 'CAM1' }],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.instructions.moves).toEqual([
      { minute: 70, player: 'p-cmf-1', position: 'CAM1' },
    ]);
  });

  it('produces empty arrays when no events', () => {
    const result = serializeTactics('m', 't', baseDraft());
    expect(result.substitutions).toEqual([]);
    expect(result.instructions.moves).toEqual([]);
  });

  it('passes through null presetId', () => {
    const draft = baseDraft({ activePresetId: null });
    const result = serializeTactics('m', 't', draft);
    expect(result.presetId).toBeNull();
  });
});

// ============================================================================
// serializePreset
// ============================================================================

describe('serializePreset', () => {
  it('produces a CreatePresetPayload with name + isDefault', () => {
    const result = serializePreset('Aggressive 4-3-3', true, baseDraft());
    expect(result.name).toBe('Aggressive 4-3-3');
    expect(result.isDefault).toBe(true);
    expect(result.formation).toBe('4-3-3');
  });

  it('returns null substitutions when no events', () => {
    const result = serializePreset('Blank', false, baseDraft({ events: [] }));
    expect(result.substitutions).toBeNull();
    expect(result.instructions).toBeNull();
  });

  it('returns arrays when events present', () => {
    const draft = baseDraft({
      events: [
        { kind: 'sub', minute: 60, outId: 'a', inId: 'b' },
        { kind: 'move', minute: 70, playerId: 'c', toSlot: 'CF' },
      ],
    });
    const result = serializePreset('With Events', false, draft);
    expect(result.substitutions).toHaveLength(1);
    expect(result.instructions).not.toBeNull();
    expect(result.instructions!.moves).toHaveLength(1);
  });
});

// ============================================================================
// hydrateTactics
// ============================================================================

describe('hydrateTactics', () => {
  it('returns a full payload from a server response', () => {
    const server = {
      formation: '4-4-2',
      lineup: { GK: 'p-gk', LB: 'p-lb' },
      tempo: 'slow' as const,
      pitchWidth: 'narrow' as const,
      defensiveLine: 'low' as const,
      substitutions: [{ minute: 60, out: 'a', in: 'b' }],
      instructions: { moves: [{ minute: 70, player: 'c', position: 'CF' }] },
      presetId: 'preset-x',
    };
    const result = hydrateTactics(server);
    expect(result.lineup).toEqual({ GK: 'p-gk', LB: 'p-lb' });
    expect(result.tempo).toBe('slow');
    expect(result.presetId).toBe('preset-x');
  });

  it('returns an empty payload when tactics is null', () => {
    const result = hydrateTactics(null);
    expect(result.lineup).toEqual({});
    expect(result.tempo).toBe('balanced');
    expect(result.pitchWidth).toBe('balanced');
    expect(result.defensiveLine).toBe('mid');
    expect(result.presetId).toBeNull();
  });
});

// ============================================================================
// hydratePreset
// ============================================================================

describe('hydratePreset', () => {
  it('passes through all preset fields', () => {
    const preset = {
      id: 'p1',
      name: 'Defensive 5-4-1',
      isDefault: true,
      formation: '5-4-1',
      lineup: { GK: 'g' },
      substitutions: null,
      instructions: null,
    };
    const result = hydratePreset(preset);
    expect(result).toEqual(preset);
  });
});
