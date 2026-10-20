/**
 * skill-groups.spec.ts — the squad page's skill lists must stay complete.
 *
 * The project's help-copy rule is "never silently drop a skill": a comparison
 * that omits the low-impact skills is broken because a reader cannot tell
 * "equal" from "irrelevant". The same failure mode exists in the UI — a skill
 * group that quietly loses an entry looks like a player who has no defending.
 * These tests pin the counts and the category routing so a refactor cannot
 * shrink them.
 */

import {
  GOALKEEPER_RADAR,
  GOALKEEPER_SKILLS,
  OUTFIELD_RADAR,
  OUTFIELD_SKILLS,
  groupSkills,
  radarSpecsFor,
  readSkillPair,
  skillSpecsFor,
} from './skill-groups';

describe('skill-groups — coverage', () => {
  it('lists all 10 outfield skills', () => {
    expect(OUTFIELD_SKILLS).toHaveLength(10);
    expect(OUTFIELD_SKILLS.map((s) => s.key).sort()).toEqual(
      [
        'composure',
        'defending',
        'dribbling',
        'finishing',
        'freeKicks',
        'pace',
        'passing',
        'penalties',
        'positioning',
        'strength',
      ].sort(),
    );
  });

  it('lists all 9 goalkeeper skills, with the keeper trio in `technical`', () => {
    expect(GOALKEEPER_SKILLS).toHaveLength(9);
    const keys = GOALKEEPER_SKILLS.map((s) => s.key);
    for (const keeperSkill of ['reflexes', 'handling', 'aerial']) {
      expect(keys).toContain(keeperSkill);
      expect(GOALKEEPER_SKILLS.find((s) => s.key === keeperSkill)?.category).toBe('technical');
    }
    // A keeper does not have an outfield defending skill.
    expect(keys).not.toContain('defending');
  });

  it('picks the right list per position', () => {
    expect(skillSpecsFor(true)).toBe(GOALKEEPER_SKILLS);
    expect(skillSpecsFor(false)).toBe(OUTFIELD_SKILLS);
    expect(radarSpecsFor(true)).toBe(GOALKEEPER_RADAR);
    expect(radarSpecsFor(false)).toBe(OUTFIELD_RADAR);
  });

  it('keeps the radar to 8 axes on both sides', () => {
    expect(OUTFIELD_RADAR).toHaveLength(8);
    expect(GOALKEEPER_RADAR).toHaveLength(8);
  });
});

describe('skill-groups — grouping', () => {
  it('emits categories in physical → technical → mental → set pieces order', () => {
    expect(groupSkills(OUTFIELD_SKILLS).map((g) => g.category)).toEqual([
      'physical',
      'technical',
      'mental',
      'setPieces',
    ]);
  });

  it('never drops a skill when grouping', () => {
    const grouped = groupSkills(OUTFIELD_SKILLS).flatMap((g) => g.specs.map((s) => s.key));
    expect(grouped.sort()).toEqual(OUTFIELD_SKILLS.map((s) => s.key).sort());
  });

  it('omits empty categories rather than rendering a bare heading', () => {
    const groups = groupSkills([{ key: 'pace', category: 'physical' }]);
    expect(groups.map((g) => g.category)).toEqual(['physical']);
  });
});

describe('skill-groups — reading values', () => {
  const current = {
    physical: { pace: 14 },
    technical: { finishing: 9, reflexes: 17 },
    mental: {},
    setPieces: { penalties: 5 },
  };
  const potential = {
    physical: { pace: 16 },
    technical: { finishing: 9, reflexes: 19 },
    mental: {},
    setPieces: { penalties: 8 },
  };

  it('reads current and potential from the right bucket', () => {
    expect(readSkillPair(current, potential, { key: 'pace', category: 'physical' })).toEqual({
      current: 14,
      potential: 16,
    });
    expect(readSkillPair(current, potential, { key: 'penalties', category: 'setPieces' })).toEqual({
      current: 5,
      potential: 8,
    });
  });

  it('reports potential below current as-is so the label can hide it', () => {
    // A declining veteran: current 9, potential no longer 9+.
    const declined = readSkillPair(
      { technical: { finishing: 9 } },
      { technical: { finishing: 6 } },
      { key: 'finishing', category: 'technical' },
    );
    expect(declined).toEqual({ current: 9, potential: 6 });
  });

  it('defaults missing buckets and keys to 0', () => {
    expect(readSkillPair(undefined, undefined, { key: 'pace', category: 'physical' })).toEqual({
      current: 0,
      potential: 0,
    });
    expect(readSkillPair({}, {}, { key: 'composure', category: 'mental' })).toEqual({
      current: 0,
      potential: 0,
    });
  });
});
