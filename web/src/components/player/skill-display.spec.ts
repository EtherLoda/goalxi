/**
 * skill-display.spec.ts — covers the shared skill-display module that backs
 * `PlayerStatsCard` and the new `DetailedRosterPlayerCard`. Pure-function
 * tests with no React / no DOM.
 */
import {
  CATEGORY_COLORS,
  CATEGORY_NAMES,
  SKILL_CATEGORIES,
  SKILL_LABELS,
  SKILL_MAX,
  formatSkillLabel,
  getCategoryName,
} from './skill-display';

describe('skill-display', () => {
  it('exposes the four canonical categories in fixed order', () => {
    expect(SKILL_CATEGORIES).toEqual(['physical', 'technical', 'mental', 'setPieces']);
  });

  it('exposes a color for every category', () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(CATEGORY_COLORS[cat]).toMatch(/^text-\[#/);
    }
  });

  it('exposes bilingual category names', () => {
    expect(getCategoryName('physical', 'en')).toBe('Physical');
    expect(getCategoryName('physical', 'zh')).toBe('体能');
    expect(getCategoryName('setPieces', 'zh')).toBe('定位球');
  });

  it('formatSkillLabel returns the localized label for known skills (raw and lowercase)', () => {
    // Lowercase data keys (pace, finishing, positioning, …).
    expect(formatSkillLabel('pace', 'en')).toBe('Pace');
    expect(formatSkillLabel('Pace', 'en')).toBe('Pace'); // case-insensitive
    expect(formatSkillLabel('finishing', 'zh')).toBe('终结');
    // camelCase data keys (freeKicks, penalties, reflexes, …).
    expect(formatSkillLabel('freeKicks', 'en')).toBe('FKick');
    expect(formatSkillLabel('freeKicks', 'zh')).toBe('任意球');
    expect(formatSkillLabel('FreeKicks', 'en')).toBe('FKick'); // case-insensitive
    expect(formatSkillLabel('reflexes', 'zh')).toBe('反应');
  });

  it('formatSkillLabel falls back to Title-Case for unknown skills', () => {
    expect(formatSkillLabel('newSkill', 'en')).toBe('NewSkill');
    expect(formatSkillLabel('newSkill', 'zh')).toBe('NewSkill');
  });

  it('SKILL_MAX is the bar denominator', () => {
    expect(SKILL_MAX).toBe(20);
  });

  it('SKILL_LABELS keys are stable (no required casing)', () => {
    // The table is keyed by the natural casing of each skill as it appears
    // in the data: lowercase for physical/technical/mental, camelCase for
    // setPieces + a few GK skills. The lookup is case-insensitive, so
    // this test simply asserts every key is a non-empty string.
    for (const [key, value] of Object.entries(SKILL_LABELS)) {
      expect(key.length).toBeGreaterThan(0);
      expect(value.en.length).toBeGreaterThan(0);
      expect(value.zh.length).toBeGreaterThan(0);
    }
  });

  it('CATEGORY_NAMES has entries for every category', () => {
    for (const cat of SKILL_CATEGORIES) {
      expect(CATEGORY_NAMES[cat].en).toBeTruthy();
      expect(CATEGORY_NAMES[cat].zh).toBeTruthy();
    }
  });
});
