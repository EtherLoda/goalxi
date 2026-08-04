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
  normalizeLineup,
} from './api-helpers';
import { createEmptyDraft, type TacticsDraft } from './types';

// ============================================================================
// Fixtures — numeric player ids (post-UUID-removal)
// ============================================================================

const ID_GK = 200_001;
const ID_LB = 200_002;
const ID_CB_1 = 200_003;
const ID_CB_2 = 200_004;
const ID_CB_3 = 200_005;
const ID_RB = 200_006;
const ID_CMF_1 = 200_007;
const ID_CMF_2 = 200_008;
const ID_CMF_3 = 200_009;
const ID_CF_1 = 200_010;
const ID_CF_2 = 200_011;
const ID_CF_3 = 200_012;
const ID_BENCH_1 = 200_013;

function baseDraft(overrides: Partial<TacticsDraft> = {}): TacticsDraft {
  return {
    ...createEmptyDraft(),
    lineup: {
      GK: ID_GK,
      LB: ID_LB, CBL: ID_CB_1, CB: ID_CB_2, RB: ID_RB,
      CML: ID_CMF_1, CM: ID_CMF_2, CMR: ID_CMF_3,
      LW: ID_CF_1, CF: ID_CF_2, RW: ID_CF_3,
    },
    bench: { BENCH_CB: ID_BENCH_1 },
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
      GK: ID_GK, LB: 1, CBL: 2, CB: 3, RB: 4,
      CML: 5, CM: 6, CMR: 7,
      LW: 8, CF: 9, RW: 10,
    };
    expect(computeFormation(lineup)).toBe('4-3-3');
  });

  it('returns 5-3-2 for a 3-5-2 layout (wing-backs counted as defenders)', () => {
    const lineup: TacticsDraft['lineup'] = {
      GK: ID_GK, CBL: 1, CB: 2, CBR: 3,
      LWB: 4, CML: 5, CM: 6, CMR: 7, RWB: 8,
      CFL: 9, CFR: 10,
    };
    expect(computeFormation(lineup)).toBe('5-3-2');
  });

  it('returns 0-0-0 for empty lineup', () => {
    expect(computeFormation({})).toBe('0-0-0');
  });

  it('GK is not counted in defender tally', () => {
    // Without GK, 4-3-3 layout (LB, CBL, CB, CBR, RB) shows 5-3-3.
    // GK is separate from defender count.
    const lineup: TacticsDraft['lineup'] = {
      LB: 1, CBL: 2, CB: 3, CBR: 4, RB: 5,
      CML: 6, CM: 7, CMR: 8,
      LW: 9, CF: 10, RW: 11,
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
    expect(flat['GK']).toBe(ID_GK);
    expect(flat['BENCH_CB']).toBe(ID_BENCH_1);
    expect(Object.keys(flat)).toHaveLength(12);
  });

  it('skips empty slots', () => {
    const draft = baseDraft({ lineup: { GK: ID_GK }, bench: {} });
    const flat = flattenLineup(draft);
    expect(flat).toEqual({ GK: ID_GK });
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
    expect(result.lineup['GK']).toBe(ID_GK);
    expect(result.lineup['BENCH_CB']).toBe(ID_BENCH_1);
  });

  it('includes sub events in substitutions', () => {
    const draft = baseDraft({
      events: [{ kind: 'sub', minute: 60, outId: ID_CMF_1, inId: ID_BENCH_1 }],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.substitutions).toEqual([{ minute: 60, out: ID_CMF_1, in: ID_BENCH_1 }]);
  });

  it('includes move events in instructions.moves', () => {
    const draft = baseDraft({
      events: [{ kind: 'move', minute: 70, playerId: ID_CMF_1, toSlot: 'CAML' }],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.instructions.moves).toEqual([
      { minute: 70, player: ID_CMF_1, position: 'CAML' },
    ]);
  });

  it('passes through event.condition on substitutions and moves', () => {
    const draft = baseDraft({
      events: [
        { kind: 'sub', minute: 60, outId: 1, inId: 2, condition: 'leading' },
        { kind: 'move', minute: 70, playerId: 3, toSlot: 'CF', condition: 'trailing' },
      ],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.substitutions[0]).toEqual({
      minute: 60, out: 1, in: 2, condition: 'leading',
    });
    expect(result.instructions.moves[0]).toEqual({
      minute: 70, player: 3, position: 'CF', condition: 'trailing',
    });
  });

  it('omits the condition field when it is "always" (the implicit default)', () => {
    const draft = baseDraft({
      events: [
        { kind: 'sub', minute: 60, outId: 1, inId: 2, condition: 'always' },
      ],
    });
    const result = serializeTactics('m', 't', draft);
    expect(result.substitutions[0]).not.toHaveProperty('condition');
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
        { kind: 'sub', minute: 60, outId: 1, inId: 2 },
        { kind: 'move', minute: 70, playerId: 3, toSlot: 'CF' },
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
      lineup: { GK: ID_GK, LB: ID_LB },
      tempo: 'slow' as const,
      pitchWidth: 'narrow' as const,
      defensiveLine: 'low' as const,
      substitutions: [{ minute: 60, out: 1, in: 2 }],
      instructions: { moves: [{ minute: 70, player: 3, position: 'CF' }] },
      presetId: 'preset-x',
    };
    const result = hydrateTactics(server);
    expect(result.lineup).toEqual({ GK: ID_GK, LB: ID_LB });
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
      lineup: { GK: ID_GK },
      substitutions: null,
      instructions: null,
    };
    const result = hydratePreset(preset);
    expect(result).toEqual(preset);
  });
});

// ============================================================================
// normalizeLineup — legacy short code aliasing
// ============================================================================

describe('normalizeLineup', () => {
  it('passes through canonical slot keys untouched', () => {
    const { pitch, bench } = normalizeLineup({
      GK: ID_GK,
      CBL: ID_CB_1,
      CB: ID_CB_2,
      CBR: ID_CB_3,
      CML: ID_CMF_1,
      CM: ID_CMF_2,
      BENCH_GK: ID_BENCH_1,
    });
    expect(pitch).toEqual({
      GK: ID_GK,
      CBL: ID_CB_1,
      CB: ID_CB_2,
      CBR: ID_CB_3,
      CML: ID_CMF_1,
      CM: ID_CMF_2,
    });
    expect(bench).toEqual({ BENCH_GK: ID_BENCH_1 });
  });

  it('maps legacy short codes (non-canonical only) to canonical pitch slots', () => {
    // Note: 'CB' and 'CM' are now canonical pitch slots, so they pass
    // through unchanged. The legacy aliases that still fold are 'CD',
    // 'CDL' / 'CDR', 'DM' / 'DMR' / 'CDM', 'AM' / 'AML' / 'AMR', and
    // 'ST' → 'CF' (ST was never canonical).
    const { pitch, bench } = normalizeLineup({
      GK: ID_GK,
      CDL: ID_CB_1,        // → CBL
      DM: ID_CMF_1,        // → DMFL
      ST: ID_CF_2,         // → CF
    });
    expect(pitch.GK).toBe(ID_GK);
    expect(pitch.CBL).toBe(ID_CB_1);
    expect(pitch.DMFL).toBe(ID_CMF_1);
    expect(pitch.CF).toBe(ID_CF_2);
    expect(bench).toEqual({});
  });

  it('maps DM/AM to the defensive/attacking midfield slots', () => {
    const { pitch } = normalizeLineup({
      DM: ID_CB_3,
      AM: ID_CF_1,
    });
    expect(pitch.DMFL).toBe(ID_CB_3);
    expect(pitch.CAML).toBe(ID_CF_1);
  });

  it('drops unrecognised slot keys instead of producing invalid slots', () => {
    const { pitch, bench } = normalizeLineup({
      GK: ID_GK,
      BANANA: 999_001,
      BENCH_PINEAPPLE: 999_002,
    });
    expect(pitch).toEqual({ GK: ID_GK });
    expect(bench).toEqual({});
  });

  it('skips entries with zero playerIds', () => {
    const { pitch, bench } = normalizeLineup({
      GK: ID_GK,
      CB: 0,
      BENCH_GK: 0,
    });
    expect(pitch).toEqual({ GK: ID_GK });
    expect(bench).toEqual({});
  });
});

describe('hydrateTactics — legacy short code aliasing', () => {
  it('normalizes legacy non-canonical keys in the returned lineup', () => {
    // Note: 'CB' and 'CM' are now canonical pitch slots, so they pass
    // through unchanged. The non-canonical codes (CDL, DM, ST, etc.) are
    // what the legacy map still folds.
    const server = {
      formation: '4-4-2',
      lineup: { GK: ID_GK, CDL: ID_CB_1, DM: ID_CMF_1, ST: ID_CF_2 },
      tempo: 'balanced' as const,
      pitchWidth: 'balanced' as const,
      defensiveLine: 'mid' as const,
      substitutions: null,
      instructions: null,
      presetId: null,
    };
    const result = hydrateTactics(server);
    expect(result.lineup).toEqual({
      GK: ID_GK,
      CBL: ID_CB_1,
      DMFL: ID_CMF_1,
      CF: ID_CF_2,
    });
  });

  it('normalizes move.toSlot short codes (ST → CF) and drops unrecognised ones', () => {
    // CB is now canonical, so position: 'CB' passes through (not 'CBL').
    // We use 'CDL' here to exercise the alias path that folds to CBL.
    const server = {
      formation: '4-4-2',
      lineup: { GK: ID_GK },
      tempo: 'balanced' as const,
      pitchWidth: 'balanced' as const,
      defensiveLine: 'mid' as const,
      substitutions: null,
      instructions: {
        moves: [
          { minute: 60, player: ID_CF_2, position: 'ST' },
          { minute: 70, player: ID_CB_1, position: 'CDL' },
          { minute: 80, player: 999_001, position: 'BANANA' },
        ],
      },
      presetId: null,
    };
    const result = hydrateTactics(server);
    expect(result.instructions).not.toBeNull();
    expect(result.instructions!.moves).toEqual([
      { minute: 60, player: ID_CF_2, position: 'CF' },
      { minute: 70, player: ID_CB_1, position: 'CBL' },
    ]);
  });

  it('returns null instructions when all moves are dropped', () => {
    const server = {
      formation: '4-4-2',
      lineup: { GK: ID_GK },
      tempo: 'balanced' as const,
      pitchWidth: 'balanced' as const,
      defensiveLine: 'mid' as const,
      substitutions: null,
      instructions: { moves: [{ minute: 60, player: 1, position: 'BANANA' }] },
      presetId: null,
    };
    const result = hydrateTactics(server);
    expect(result.instructions).toBeNull();
  });

  it('preserves condition field on server substitutions', () => {
    const server = {
      formation: '4-4-2',
      lineup: { GK: ID_GK },
      tempo: 'balanced' as const,
      pitchWidth: 'balanced' as const,
      defensiveLine: 'mid' as const,
      substitutions: [{ minute: 60, out: 1, in: 2, condition: 'leading' }],
      instructions: null,
      presetId: null,
    };
    const result = hydrateTactics(server);
    expect(result.substitutions![0]).toEqual({
      minute: 60, out: 1, in: 2, condition: 'leading',
    });
  });
});
