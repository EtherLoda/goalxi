import { formationOf, lineOf, sortLineup } from './lineup-order';

const xi = [
  { name: 'Lei Peng', position: 'GK' },
  { name: 'Bo Gao', position: 'LB' },
  { name: 'Yong Hu', position: 'CB' },
  { name: 'Wen Huang', position: 'CBL' },
  { name: 'Hao Zhao', position: 'RB' },
  { name: 'Wei Deng', position: 'RWB' },
  { name: 'Jun Guo', position: 'CM' },
  { name: 'Ezequiel Ramirez', position: 'CML' },
  { name: 'Feng Hu', position: 'CMR' },
  { name: 'Rodrigo Perez', position: 'RM' },
  { name: 'Gang Wu', position: 'CF' },
];

describe('lineOf', () => {
  it('maps slot codes to lines', () => {
    expect(lineOf('GK')).toBe('gk');
    expect(lineOf('cb')).toBe('def');
    expect(lineOf('RWB')).toBe('def');
    expect(lineOf('DMFL')).toBe('mid');
    expect(lineOf('RW')).toBe('fwd');
    expect(lineOf('???')).toBe('other');
    expect(lineOf(null)).toBe('other');
  });
});

describe('sortLineup', () => {
  it('reads keeper → defence → midfield → attack', () => {
    const shuffled = [xi[4], xi[10], xi[0], xi[6], xi[9], xi[2], xi[5], xi[1], xi[7], xi[3], xi[8]];
    const order = sortLineup(shuffled).map((p) => p.position);
    expect(order).toEqual([
      'GK',
      'LB',
      'CBL',
      'CB',
      'RB',
      'RWB',
      'CML',
      'CM',
      'CMR',
      'RM',
      'CF',
    ]);
  });

  it('keeps unknown codes at the bottom instead of the top', () => {
    const order = sortLineup([...xi, { name: 'X', position: 'NOPE' }]).map((p) => p.position);
    expect(order[order.length - 1]).toBe('NOPE');
  });

  it('does not mutate the input', () => {
    const input = [...xi];
    const copy = [...input];
    sortLineup(input);
    expect(input).toEqual(copy);
  });
});

describe('formationOf', () => {
  it('counts lines, excluding the keeper', () => {
    // 5 defenders (LB, CBL, CB, RB, RWB) + 4 midfielders + 1 forward.
    expect(formationOf(xi)).toBe('5-4-1');
  });

  it('treats wingers as attackers and wide midfielders as midfielders', () => {
    const shape = [
      { position: 'GK' },
      { position: 'LB' },
      { position: 'CBL' },
      { position: 'CBR' },
      { position: 'RB' },
      { position: 'CML' },
      { position: 'CM' },
      { position: 'CMR' },
      { position: 'LW' },
      { position: 'CF' },
      { position: 'RW' },
    ];
    expect(formationOf(shape)).toBe('4-3-3');
    expect(formationOf([...shape.filter((p) => p.position !== 'LW'), { position: 'RM' }])).toBe(
      '4-4-2',
    );
  });

  it('returns null when no line is recognisable', () => {
    expect(formationOf([])).toBeNull();
    expect(formationOf([{ position: 'GK' }])).toBeNull();
  });
});
