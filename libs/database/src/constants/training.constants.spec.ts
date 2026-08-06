/**
 * The youth-coach helpers (`YOUTH_COACH_CATEGORIES`,
 * `isYouthCoachCategory`, `getCategorySkillKeys`) used to live in
 * this file but were removed together with the YOUTH_COACH staff role.
 * Senior coaches still rely on `SKILL_CATEGORY_MAP` for trained-skill
 * validation, so we keep a single sanity test for that.
 */
import { SKILL_CATEGORY_MAP } from './training.constants';

describe('training.constants / SKILL_CATEGORY_MAP', () => {
  it('exposes the five senior training categories', () => {
    expect(Object.keys(SKILL_CATEGORY_MAP).sort()).toEqual(
      ['goalkeeper', 'mental', 'physical', 'setPieces', 'technical'],
    );
  });

  it('keeps every GK-only key inside the goalkeeper category', () => {
    // Senior coaches validate `trainedSkill` against
    // `SKILL_CATEGORY_MAP[getTrainingCategoryForRole(role)]`. A
    // mismatch would silently break the PATCH /staffs/:id/trained-skill
    // route, so the test pins the GK-only keys here.
    expect(SKILL_CATEGORY_MAP.goalkeeper.sort()).toEqual([
      'aerial',
      'handling',
      'reflexes',
    ]);
  });
});
