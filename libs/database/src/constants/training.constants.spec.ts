import {
  YOUTH_COACH_CATEGORIES,
  getCategorySkillKeys,
  getSkillCategory,
  isYouthCoachCategory,
  SKILL_CATEGORY_MAP,
} from './training.constants';

describe('training.constants / youth-coach helpers', () => {
  describe('SKILL_CATEGORY_MAP', () => {
    it('covers the 5 categories exposed to the youth coach', () => {
      expect(Object.keys(SKILL_CATEGORY_MAP).sort()).toEqual(
        [...YOUTH_COACH_CATEGORIES].sort(),
      );
    });
  });

  describe('isYouthCoachCategory', () => {
    it.each([
      'physical',
      'technical',
      'mental',
      'setPieces',
      'goalkeeper',
    ])('accepts %s', (c) => {
      expect(isYouthCoachCategory(c)).toBe(true);
    });

    it.each([
      'tactics',     // senior-only
      'recovery',    // senior-only
      'magic',       // nonsense
      '',
      undefined,
      null,
    ])('rejects %p', (c) => {
      expect(isYouthCoachCategory(c as any)).toBe(false);
    });
  });

  describe('getCategorySkillKeys', () => {
    it('returns all category keys for a GK', () => {
      expect(getCategorySkillKeys('goalkeeper', true).sort()).toEqual(
        ['aerial', 'handling', 'reflexes'],
      );
    });

    it('filters out GK-only keys for an outfield player', () => {
      const keys = getCategorySkillKeys('goalkeeper', false);
      expect(keys).toEqual([]);
    });

    it('returns outfield keys for an outfield player in physical/technical/mental/setPieces', () => {
      expect(getCategorySkillKeys('physical', false).sort()).toEqual([
        'pace',
        'strength',
      ]);
      expect(getCategorySkillKeys('technical', false).sort()).toEqual([
        'defending',
        'dribbling',
        'finishing',
        'passing',
      ]);
      expect(getCategorySkillKeys('mental', false).sort()).toEqual([
        'composure',
        'positioning',
      ]);
      expect(getCategorySkillKeys('setPieces', false).sort()).toEqual([
        'freeKicks',
        'penalties',
      ]);
    });

    it('returns an empty array for unknown categories', () => {
      expect(getCategorySkillKeys('nope', false)).toEqual([]);
    });
  });

  describe('getSkillCategory (round-trip)', () => {
    it('every key in SKILL_CATEGORY_MAP maps back to its parent category', () => {
      for (const [category, keys] of Object.entries(SKILL_CATEGORY_MAP)) {
        for (const k of keys) {
          expect(getSkillCategory(k)).toBe(category);
        }
      }
    });
  });
});
