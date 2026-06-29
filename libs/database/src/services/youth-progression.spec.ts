import { applyWeeklyGrowth, pickNextRevealSkills } from './youth-progression';

const FULL_SKILLS = {
  isGoalkeeper: false,
  currentSkills: {
    physical: { pace: 10, strength: 10 },
    technical: { finishing: 10, passing: 10, dribbling: 10, defending: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  },
  potentialSkills: {
    physical: { pace: 18, strength: 18 },
    technical: { finishing: 18, passing: 18, dribbling: 18, defending: 18 },
    mental: { positioning: 18, composure: 18 },
    setPieces: { freeKicks: 18, penalties: 18 },
  },
};

const GK_SKILLS = {
  isGoalkeeper: true,
  currentSkills: {
    physical: { pace: 10, strength: 10 },
    technical: { reflexes: 10, handling: 10, aerial: 10 },
    mental: { positioning: 10, composure: 10 },
    setPieces: { freeKicks: 10, penalties: 10 },
  },
  potentialSkills: {
    physical: { pace: 16, strength: 16 },
    technical: { reflexes: 16, handling: 16, aerial: 16 },
    mental: { positioning: 16, composure: 16 },
    setPieces: { freeKicks: 16, penalties: 16 },
  },
};

describe('applyWeeklyGrowth', () => {
  it('does not grow when random returns 0', () => {
    const youth = JSON.parse(JSON.stringify(FULL_SKILLS));
    applyWeeklyGrowth(youth, () => 0);
    expect(youth.currentSkills.physical.pace).toBe(10);
    expect(youth.currentSkills.technical.finishing).toBe(10);
  });

  it('grows every tracked skill by exactly maxGrowth when random returns 1', () => {
    const youth = JSON.parse(JSON.stringify(FULL_SKILLS));
    applyWeeklyGrowth(youth, () => 1, 0.1);
    // 10 + 0.1 = 10.1
    expect(youth.currentSkills.physical.pace).toBe(10.1);
    expect(youth.currentSkills.technical.finishing).toBe(10.1);
    expect(youth.currentSkills.technical.defending).toBe(10.1);
  });

  it('caps current skill at potential (no overflow)', () => {
    const youth = JSON.parse(JSON.stringify(FULL_SKILLS));
    youth.currentSkills.physical.pace = 17.95; // near cap
    applyWeeklyGrowth(youth, () => 1, 0.1);
    // 17.95 + 0.1 = 18.05 → cap at 18 → 18.00
    expect(youth.currentSkills.physical.pace).toBe(18);
  });

  it('uses MS-style rounding to 2 decimals', () => {
    const youth = JSON.parse(JSON.stringify(FULL_SKILLS));
    applyWeeklyGrowth(youth, () => 0.33333, 0.1);
    // 10 + 0.033333 → 10.03
    expect(youth.currentSkills.physical.pace).toBe(10.03);
  });

  it('leaves GK skills capped at GK potential', () => {
    const youth = JSON.parse(JSON.stringify(GK_SKILLS));
    applyWeeklyGrowth(youth, () => 1, 0.1);
    // 10 + 0.1 = 10.1
    expect(youth.currentSkills.technical.reflexes).toBe(10.1);
    expect(youth.currentSkills.technical.handling).toBe(10.1);
    expect(youth.currentSkills.technical.aerial).toBe(10.1);
  });

  it('returns the same object reference (mutation pattern, documented)', () => {
    const youth = JSON.parse(JSON.stringify(FULL_SKILLS));
    const result = applyWeeklyGrowth(youth, () => 0.5);
    expect(result).toBe(youth);
  });
});

describe('pickNextRevealSkills', () => {
  it('reveals exactly 1 skill when random < 0.5', () => {
    const result = pickNextRevealSkills(
      { isGoalkeeper: false, revealedSkills: ['pace'] },
      () => 0.1,
    );
    expect(result.length).toBe(2);
    expect(result[0]).toBe('pace');
  });

  it('reveals exactly 2 skills when random >= 0.5', () => {
    const result = pickNextRevealSkills(
      { isGoalkeeper: false, revealedSkills: ['pace'] },
      () => 0.9,
    );
    expect(result.length).toBe(3);
    expect(result[0]).toBe('pace');
  });

  it('never duplicates an already-revealed skill', () => {
    const result = pickNextRevealSkills(
      { isGoalkeeper: false, revealedSkills: ['pace', 'strength', 'finishing'] },
      () => 0.9,
    );
    expect(result.length).toBe(5);
    expect(new Set(result).size).toBe(result.length);
  });

  it('returns input unchanged when all skills are revealed', () => {
    const allOutfield = [
      'pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending',
      'positioning', 'composure', 'freeKicks', 'penalties',
    ];
    const result = pickNextRevealSkills(
      { isGoalkeeper: false, revealedSkills: allOutfield },
      () => 0.9,
    );
    expect(result).toEqual(allOutfield);
  });

  it('uses the GK key list when isGoalkeeper=true', () => {
    const result = pickNextRevealSkills(
      { isGoalkeeper: true, revealedSkills: [] },
      () => 0.1,
    );
    // First reveal should be 1 GK-specific key (e.g. reflexes, handling, aerial)
    const gkKeys = ['pace', 'strength', 'reflexes', 'handling', 'aerial', 'positioning', 'composure', 'freeKicks', 'penalties'];
    expect(gkKeys).toContain(result[0]);
    expect(result.length).toBe(1);
  });

  it('respects remaining-count cap (only 1 left → reveal just 1)', () => {
    const allButOne = [
      'pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending',
      'positioning', 'composure', 'freeKicks',
    ];
    const result = pickNextRevealSkills(
      { isGoalkeeper: false, revealedSkills: allButOne },
      () => 0.9, // wants to reveal 2, but only 1 remaining
    );
    expect(result.length).toBe(10);
  });
});