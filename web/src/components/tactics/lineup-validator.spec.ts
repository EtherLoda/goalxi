/**
 * lineup-validator.spec.ts — exhaustive coverage of the pure validator.
 * Target: 100% statement + branch coverage.
 */

import {
  validateLineup,
  countFilled,
  findSlotOfPlayer,
  type ValidatorPlayer,
  type ValidationContext,
} from './lineup-validator';
import { createEmptyDraft, type TacticsDraft } from './types';

// ============================================================================
// Fixtures
// ============================================================================

const GK_IDS = { alice: 'p-gk-1' };
const OUT_IDS = {
  bob: 'p-cb-1',
  carol: 'p-cb-2',
  dave: 'p-cb-3',
  eve: 'p-lb',
  frank: 'p-rb',
  gina: 'p-dmf-1',
  henry: 'p-cm-1',
  iris: 'p-cm-2',
  jack: 'p-rm',
  kate: 'p-cf-1',
  liam: 'p-cf-2',
  mia: 'p-cf-3',
};

const TEAM_IDS = new Set<string>([
  GK_IDS.alice,
  OUT_IDS.bob,
  OUT_IDS.carol,
  OUT_IDS.dave,
  OUT_IDS.eve,
  OUT_IDS.frank,
  OUT_IDS.gina,
  OUT_IDS.henry,
  OUT_IDS.iris,
  OUT_IDS.jack,
  OUT_IDS.kate,
  OUT_IDS.liam,
  OUT_IDS.mia,
]);

function makePlayer(id: string, isGoalkeeper: boolean, name = id): ValidatorPlayer {
  return { id, isGoalkeeper, name };
}

function makePlayersById(): Map<string, ValidatorPlayer> {
  const map = new Map<string, ValidatorPlayer>();
  map.set(GK_IDS.alice, makePlayer(GK_IDS.alice, true, 'Alice (GK)'));
  for (const id of Object.values(OUT_IDS)) {
    map.set(id, makePlayer(id, false, `Out ${id}`));
  }
  return map;
}

/** Build a valid 11-pitch + 0-bench baseline. */
function validLineup(): Partial<TacticsDraft['lineup']> {
  return {
    GK: GK_IDS.alice,
    LB: OUT_IDS.eve,
    CB1: OUT_IDS.bob,
    CB2: OUT_IDS.carol,
    RB: OUT_IDS.frank,
    DMF1: OUT_IDS.gina,
    CM1: OUT_IDS.henry,
    CM2: OUT_IDS.iris,
    RM: OUT_IDS.jack,
    CFL: OUT_IDS.kate,
    CFR: OUT_IDS.liam,
  };
}

function baseCtx(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    draft: { ...createEmptyDraft(), lineup: validLineup() },
    teamPlayerIds: TEAM_IDS,
    playersById: makePlayersById(),
    ...overrides,
  };
}

// ============================================================================
// Happy path
// ============================================================================

describe('validateLineup — happy path', () => {
  it('returns isValid=true for a complete valid 11-pitch lineup', () => {
    const result = validateLineup(baseCtx());
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('returns isValid=true for a 9-pitch lineup (minimum)', () => {
    const lineup: TacticsDraft['lineup'] = {
      GK: GK_IDS.alice,
      CB1: OUT_IDS.bob,
      CB2: OUT_IDS.carol,
      CB3: OUT_IDS.dave,
      DMF1: OUT_IDS.gina,
      CM1: OUT_IDS.henry,
      CM2: OUT_IDS.iris,
      CFL: OUT_IDS.kate,
      CFR: OUT_IDS.liam,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.isValid).toBe(true);
  });

  it('returns isValid=true when bench is filled with valid players', () => {
    const bench: TacticsDraft['bench'] = {
      BENCH_GK: GK_IDS.alice, // duplicates pitch — allowed
      BENCH_CB: OUT_IDS.dave,
      BENCH_FB: OUT_IDS.eve,
      BENCH_W: OUT_IDS.kate,
      BENCH_CM: OUT_IDS.henry,
      BENCH_FW: OUT_IDS.mia,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup: validLineup(), bench } }));
    expect(result.isValid).toBe(true);
  });
});

// ============================================================================
// Pitch count
// ============================================================================

describe('validateLineup — pitch count', () => {
  it('flags too few (8) players with playerCountMin', () => {
    const lineup: TacticsDraft['lineup'] = {
      GK: GK_IDS.alice,
      CB1: OUT_IDS.bob,
      CB2: OUT_IDS.carol,
      CB3: OUT_IDS.dave,
      CM1: OUT_IDS.henry,
      CM2: OUT_IDS.iris,
      CFL: OUT_IDS.kate,
      CFR: OUT_IDS.liam,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      key: 'playerCountMin',
      params: { count: 8 },
    });
  });

  it('flags too many (12) players with playerCountMax', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      LW: OUT_IDS.mia,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      key: 'playerCountMax',
      params: { count: 12 },
    });
  });

  it('flags empty lineup with playerCountMin', () => {
    const result = validateLineup(baseCtx({ draft: createEmptyDraft() }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      key: 'playerCountMin',
      params: { count: 0 },
    });
    // Also missing GK
    expect(result.errors).toContainEqual({ key: 'goalkeeperRequired', params: {} });
  });
});

// ============================================================================
// GK rules
// ============================================================================

describe('validateLineup — GK rules', () => {
  it('flags missing GK with goalkeeperRequired', () => {
    const lineup: TacticsDraft['lineup'] = {
      LB: OUT_IDS.eve,
      CB1: OUT_IDS.bob,
      CB2: OUT_IDS.carol,
      RB: OUT_IDS.frank,
      CM1: OUT_IDS.henry,
      CM2: OUT_IDS.iris,
      CM3: OUT_IDS.jack,
      LW: OUT_IDS.kate,
      CF: OUT_IDS.liam,
      RW: OUT_IDS.mia,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.errors).toContainEqual({ key: 'goalkeeperRequired', params: {} });
  });

  it('flags outfielder in GK slot with gkOnlyInGk', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      GK: OUT_IDS.bob, // outfielder
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.errors).toContainEqual({
      key: 'gkOnlyInGk',
      params: { player: 'Out p-cb-1' },
    });
  });

  it('flags goalkeeper in outfield slot with outfieldersNotInGk', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      CB1: GK_IDS.alice, // GK in outfield
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.errors).toContainEqual({
      key: 'outfieldersNotInGk',
      params: { player: 'Alice (GK)', slot: 'CB1' },
    });
  });
});

// ============================================================================
// Bench rules
// ============================================================================

describe('validateLineup — bench rules', () => {
  it('flags outfielder in BENCH_GK with benchGkOnly', () => {
    const bench: TacticsDraft['bench'] = {
      BENCH_GK: OUT_IDS.bob,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup: validLineup(), bench } }));
    expect(result.errors).toContainEqual({
      key: 'benchGkOnly',
      params: { player: 'Out p-cb-1' },
    });
  });

  it('flags goalkeeper in non-GK bench slot with benchGkOnly', () => {
    const bench: TacticsDraft['bench'] = {
      BENCH_CB: GK_IDS.alice,
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup: validLineup(), bench } }));
    expect(result.errors).toContainEqual({
      key: 'benchGkOnly',
      params: { player: 'Alice (GK)' },
    });
  });
});

// ============================================================================
// Player membership
// ============================================================================

describe('validateLineup — player membership', () => {
  it('flags player not on team with playerNotInTeam', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      CB1: 'p-stranger',
    };
    const playersById = makePlayersById();
    playersById.set('p-stranger', makePlayer('p-stranger', false, 'Stranger'));
    const result = validateLineup(
      baseCtx({ draft: { ...createEmptyDraft(), lineup }, playersById }),
    );
    expect(result.errors).toContainEqual({
      key: 'playerNotInTeam',
      params: { player: 'Stranger' },
    });
  });

  it('uses playerId as fallback when player not in playersById map', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      CB1: 'p-unknown',
    };
    // 'p-unknown' is NOT in teamPlayerIds → triggers playerNotInTeam with the raw id
    const result = validateLineup(
      baseCtx({
        draft: { ...createEmptyDraft(), lineup },
        playersById: makePlayersById(),
      }),
    );
    expect(result.errors).toContainEqual({
      key: 'playerNotInTeam',
      params: { player: 'p-unknown' },
    });
  });
});

// ============================================================================
// Duplicates on pitch
// ============================================================================

describe('validateLineup — duplicate detection', () => {
  it('flags the same player in two pitch slots with duplicatePlayer', () => {
    const lineup: TacticsDraft['lineup'] = {
      ...validLineup(),
      CB3: OUT_IDS.bob, // duplicate of CB1
    };
    const result = validateLineup(baseCtx({ draft: { ...createEmptyDraft(), lineup } }));
    expect(result.errors).toContainEqual({
      key: 'duplicatePlayer',
      params: { player: 'Out p-cb-1', slot: 'CB3' },
    });
  });

  it('does NOT flag pitch/bench duplicates (backend allows)', () => {
    const bench: TacticsDraft['bench'] = {
      BENCH_CB: OUT_IDS.bob, // also in CB1 on pitch
    };
    const result = validateLineup(
      baseCtx({ draft: { ...createEmptyDraft(), lineup: validLineup(), bench } }),
    );
    const dupeErrors = result.errors.filter((e) => e.key === 'duplicatePlayer');
    expect(dupeErrors).toEqual([]);
  });
});

// ============================================================================
// Tactical events
// ============================================================================

describe('validateLineup — tactical events', () => {
  it('flags move event when player is not on the pitch', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      events: [
        { kind: 'move', minute: 60, playerId: 'p-ghost', toSlot: 'CF' },
      ],
    };
    const result = validateLineup(baseCtx({ draft }));
    expect(result.errors).toContainEqual({
      key: 'eventPlayerMissing',
      params: { minute: 60 },
    });
  });

  it('flags move event when target equals current slot', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      events: [
        { kind: 'move', minute: 70, playerId: OUT_IDS.bob, toSlot: 'CB1' },
      ],
    };
    const result = validateLineup(baseCtx({ draft }));
    expect(result.errors).toContainEqual({
      key: 'moveToSamePosition',
      params: { minute: 70 },
    });
  });

  it('accepts valid move event', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      events: [
        { kind: 'move', minute: 65, playerId: OUT_IDS.henry, toSlot: 'CM3' },
      ],
    };
    const result = validateLineup(baseCtx({ draft }));
    const moveErrors = result.errors.filter(
      (e) => e.key === 'eventPlayerMissing' || e.key === 'moveToSamePosition',
    );
    expect(moveErrors).toEqual([]);
  });

  it('flags sub event when GK replaces outfielder (incompatible roles)', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      events: [
        { kind: 'sub', minute: 50, outId: OUT_IDS.bob, inId: GK_IDS.alice },
      ],
    };
    const result = validateLineup(baseCtx({ draft }));
    expect(result.errors).toContainEqual({
      key: 'eventPlayerMissing',
      params: { minute: 50 },
    });
  });

  it('accepts valid sub event between outfielders', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      events: [
        { kind: 'sub', minute: 55, outId: OUT_IDS.henry, inId: OUT_IDS.jack },
      ],
    };
    const result = validateLineup(baseCtx({ draft }));
    const subErrors = result.errors.filter((e) => e.key === 'eventPlayerMissing');
    expect(subErrors).toEqual([]);
  });

  it('accepts valid GK ↔ GK sub event', () => {
    // The starting GK is on pitch. We put a backup GK on the bench.
    const bench: TacticsDraft['bench'] = { BENCH_GK: GK_IDS.alice };
    // We need a second GK player to test sub — synthesize one.
    const secondGk = 'p-gk-2';
    const playersById = makePlayersById();
    playersById.set(secondGk, makePlayer(secondGk, true, 'Bob GK'));
    const teamPlayerIds = new Set([...TEAM_IDS, secondGk]);

    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: { ...validLineup(), GK: GK_IDS.alice },
      bench: { BENCH_GK: secondGk },
      events: [
        { kind: 'sub', minute: 40, outId: GK_IDS.alice, inId: secondGk },
      ],
    };
    const result = validateLineup(baseCtx({ draft, teamPlayerIds, playersById }));
    const subErrors = result.errors.filter((e) => e.key === 'eventPlayerMissing');
    expect(subErrors).toEqual([]);
  });
});

// ============================================================================
// Invalid slot keys (defensive — runtime data)
// ============================================================================

describe('validateLineup — invalid slot keys', () => {
  it('flags invalid pitch slot key with invalidSlot', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      // Force-typing through cast to simulate untrusted runtime data
      lineup: { GK: GK_IDS.alice, NOT_A_SLOT: OUT_IDS.bob } as TacticsDraft['lineup'],
    };
    const result = validateLineup(baseCtx({ draft }));
    expect(result.errors).toContainEqual({
      key: 'invalidSlot',
      params: { slot: 'NOT_A_SLOT' },
    });
  });

  it('flags invalid bench slot key with invalidSlot', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      lineup: validLineup(),
      bench: { BENCH_FAKE: OUT_IDS.bob } as TacticsDraft['bench'],
    };
    const result = validateLineup(baseCtx({ draft }));
    expect(result.errors).toContainEqual({
      key: 'invalidSlot',
      params: { slot: 'BENCH_FAKE' },
    });
  });
});

// ============================================================================
// Helpers
// ============================================================================

describe('countFilled', () => {
  it('returns 0 for empty map', () => {
    expect(countFilled({})).toBe(0);
  });

  it('returns only truthy values', () => {
    expect(countFilled({ GK: 'a', CB1: 'b', CB2: undefined as unknown as string })).toBe(2);
  });
});

describe('findSlotOfPlayer', () => {
  it('finds a player on the pitch', () => {
    const draft: TacticsDraft = { ...createEmptyDraft(), lineup: { GK: GK_IDS.alice } };
    expect(findSlotOfPlayer(draft, GK_IDS.alice)).toBe('GK');
  });

  it('finds a player on the bench', () => {
    const draft: TacticsDraft = {
      ...createEmptyDraft(),
      bench: { BENCH_GK: GK_IDS.alice },
    };
    expect(findSlotOfPlayer(draft, GK_IDS.alice)).toBe('BENCH_GK');
  });

  it('returns null when player is not assigned', () => {
    expect(findSlotOfPlayer(createEmptyDraft(), 'p-nobody')).toBeNull();
  });
});
