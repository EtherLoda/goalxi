/**
 * Unit tests for the client-side team-tactic check.
 *
 * The rules must match the server's `checkTacticRequirement` exactly, so the
 * cases below are the same edges the server spec pins: one slot satisfies at
 * most one clause, an empty slot counts for nothing, legacy aliases fold
 * into their family, and "no tactic" is always satisfiable.
 */
import type {
  PositionFamilyCode,
  TeamTacticDefinition,
} from '@/lib/api';
import type { LineupMap, PitchSlot, TeamTacticCodeValue } from '../types';
import { checkTactic, missingRequirements, tallyFamilies } from './requirement';

/** A representative slice of the server's `POSITION_FAMILIES`. */
const FAMILIES: Record<string, PositionFamilyCode> = {
  GK: 'GK',
  CBL: 'CB',
  CB: 'CB',
  CBR: 'CB',
  LB: 'FB',
  RB: 'FB',
  LWB: 'FB',
  RWB: 'FB',
  DMFL: 'DM',
  DMF: 'DM',
  DMFR: 'DM',
  CML: 'CM',
  CM: 'CM',
  CMR: 'CM',
  AML: 'AM',
  CAM: 'AM',
  AMR: 'AM',
  LM: 'W',
  RM: 'W',
  LW: 'W',
  RW: 'W',
  CFL: 'CF',
  CF: 'CF',
  CFR: 'CF',
  // Legacy aliases the server also folds.
  CD: 'CB',
  ST: 'CF',
};

const TACTICS: TeamTacticDefinition[] = [
  {
    code: 'possession',
    requirements: [
      { families: ['CM'], count: 3 },
      { families: ['AM', 'W'], count: 1 },
    ],
  },
  {
    code: 'high_press',
    requirements: [
      { families: ['AM', 'W'], count: 2 },
      { families: ['CF'], count: 1 },
      { families: ['CB'], count: 1 },
    ],
  },
  {
    code: 'counter',
    requirements: [
      { families: ['CB'], count: 2 },
      { families: ['FB'], count: 2 },
    ],
  },
  {
    code: 'central',
    requirements: [
      { families: ['DM'], count: 1 },
      { families: ['CM'], count: 2 },
      { families: ['AM'], count: 1 },
    ],
  },
  {
    code: 'wings',
    requirements: [
      { families: ['W'], count: 2 },
      { families: ['FB'], count: 2 },
    ],
  },
];

const serverTable = { families: FAMILIES, tactics: TACTICS };

function lineupOf(slots: string[], startId = 1): LineupMap {
  const lineup: LineupMap = {};
  slots.forEach((slot, index) => {
    lineup[slot as PitchSlot] = startId + index;
  });
  return lineup;
}

describe('tallyFamilies', () => {
  it('counts slots by family and ignores empty slots', () => {
    const lineup = lineupOf(['GK', 'CBL', 'CB', 'CBR', 'LB', 'RB']);
    delete lineup.CBR;
    const tally = tallyFamilies(lineup, FAMILIES);
    expect(tally.GK).toBe(1);
    expect(tally.CB).toBe(2);
    expect(tally.FB).toBe(2);
  });

  it('folds legacy slot aliases into their family', () => {
    const tally = tallyFamilies(lineupOf(['GK', 'CD', 'ST']), FAMILIES);
    expect(tally.CB).toBe(1);
    expect(tally.CF).toBe(1);
  });

  it('skips a slot the mapping does not know instead of guessing', () => {
    const tally = tallyFamilies(lineupOf(['GK', 'NOPE']), FAMILIES);
    expect(tally.GK).toBe(1);
    expect(
      tally.CB + tally.FB + tally.DM + tally.CM + tally.AM + tally.W + tally.CF,
    ).toBe(0);
  });

  it('returns zeroes for an empty lineup', () => {
    expect(tallyFamilies({}, FAMILIES)).toEqual({
      GK: 0,
      CB: 0,
      FB: 0,
      DM: 0,
      CM: 0,
      AM: 0,
      W: 0,
      CF: 0,
    });
  });
});

describe('missingRequirements', () => {
  it('reports how many more a clause needs', () => {
    const tally = { GK: 1, CB: 2, FB: 0, DM: 0, CM: 3, AM: 0, W: 0, CF: 0 };
    const missing = missingRequirements(tally, TACTICS[2]!.requirements);
    expect(missing).toEqual([{ families: ['FB'], need: 2, have: 0 }]);
  });

  it('is empty when every clause is met', () => {
    const tally = { GK: 1, CB: 2, FB: 2, DM: 0, CM: 3, AM: 0, W: 0, CF: 0 };
    expect(missingRequirements(tally, TACTICS[2]!.requirements)).toEqual([]);
  });

  it('handles a two-family clause by summing both families', () => {
    // possession's second clause accepts AM *or* W.
    const tally = { GK: 1, CB: 0, FB: 0, DM: 0, CM: 3, AM: 0, W: 1, CF: 0 };
    expect(missingRequirements(tally, TACTICS[0]!.requirements)).toEqual([]);
  });

  it('does not let one slot half-satisfy a count of two', () => {
    const tally = { GK: 1, CB: 0, FB: 2, DM: 0, CM: 0, AM: 0, W: 1, CF: 0 };
    const missing = missingRequirements(tally, TACTICS[4]!.requirements);
    expect(missing).toEqual([{ families: ['W'], need: 2, have: 1 }]);
  });
});

describe('checkTactic', () => {
  const wingerLineup = lineupOf([
    'GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'LM', 'CM', 'CM', 'RM', 'CF',
  ]);

  it('treats "no tactic" as satisfied', () => {
    expect(checkTactic(wingerLineup, null, serverTable)).toEqual({
      ok: true,
      missing: [],
    });
  });

  it('accepts a lineup that fields the tactic', () => {
    expect(checkTactic(wingerLineup, 'wings', serverTable).ok).toBe(true);
  });

  it('rejects a lineup that cannot field the tactic and says what is missing', () => {
    const noWingers = lineupOf([
      'GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'CML', 'CM', 'CMR', 'CAM', 'CF',
    ]);
    const check = checkTactic(noWingers, 'wings', serverTable);
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([{ families: ['W'], need: 2, have: 0 }]);
  });

  it('does not block a submit while the table is still loading', () => {
    expect(
      checkTactic(wingerLineup, 'wings' as TeamTacticCodeValue, null),
    ).toEqual({ ok: true, missing: [] });
  });

  it('does not block when the server did not serve the code', () => {
    const check = checkTactic(wingerLineup, 'wings', { families: {}, tactics: [] });
    expect(check.ok).toBe(true);
  });

  it('satisfies every tactic with the lineup each one is designed for', () => {
    // NB: slot keys must be distinct — a lineup map is keyed by slot, so
    // three `CM` entries would collapse into one.
    const lineups: Array<[TeamTacticCodeValue, string[]]> = [
      ['possession', ['GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'CML', 'CM', 'CMR', 'CAM', 'CF']],
      ['high_press', ['GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'CML', 'CMR', 'CAM', 'LW', 'CF']],
      ['counter', ['GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'CML', 'CMR', 'CAM', 'LW', 'CF']],
      ['central', ['GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'DMF', 'CML', 'CMR', 'CAM', 'CF']],
      ['wings', ['GK', 'LB', 'CBL', 'CB', 'CBR', 'RB', 'CML', 'CMR', 'CAM', 'LW', 'RW']],
    ];
    for (const [code, slots] of lineups) {
      expect(checkTactic(lineupOf(slots), code, serverTable).ok).toBe(true);
    }
  });
});
