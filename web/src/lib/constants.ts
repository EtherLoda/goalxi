// Player condition levels (1-5 scale)
export const STAMINA_LEVELS: Record<number, { zh: string; en: string }> = {
  1: { zh: '空槽', en: 'Empty' },
  2: { zh: '气喘', en: 'Winded' },
  3: { zh: '平稳', en: 'Steady' },
  4: { zh: '充沛', en: 'Vibrant' },
  5: { zh: '无限', en: 'Bottomless' },
};

export const FORM_LEVELS: Record<number, { zh: string; en: string }> = {
  1: { zh: '失魂', en: 'Lost' },
  2: { zh: '冰冷', en: 'Cold' },
  3: { zh: '稳定', en: 'Stable' },
  4: { zh: '火热', en: 'Hot' },
  5: { zh: '巅峰', en: 'Peak' },
};

// Skill level names (1-20)
export const SKILL_LEVELS: Record<number, { zh: string; en: string }> = {
  1: { zh: '差劲', en: 'Terrible' },
  2: { zh: '欠缺', en: 'Deficient' },
  3: { zh: '入门', en: 'Novice' },
  4: { zh: '平庸', en: 'Mediocre' },
  5: { zh: '熟练', en: 'Proficient' },
  6: { zh: '粗通', en: 'Basic' },
  7: { zh: '扎实', en: 'Solid' },
  8: { zh: '优秀', en: 'Excellent' },
  9: { zh: '杰出', en: 'Outstanding' },
  10: { zh: '精湛', en: 'Skilled' },
  11: { zh: '超群', en: 'Superlative' },
  12: { zh: '职业级', en: 'Professional' },
  13: { zh: '卓越', en: 'Exceptional' },
  14: { zh: '精英级', en: 'Elite' },
  15: { zh: '统治级', en: 'Dominant' },
  16: { zh: '大师级', en: 'Master' },
  17: { zh: '宗师', en: 'Grand Master' },
  18: { zh: '王牌', en: 'Ace' },
  19: { zh: '传奇级', en: 'Legendary' },
  20: { zh: '超凡入圣', en: 'Transcendent' },
};

// Get stamina/form level text
export function getConditionText(
  value: number,
  locale: string,
): { level: number; text: string } {
  const level = Math.ceil(value);
  const clampedLevel = Math.max(1, Math.min(5, level));
  const texts = value >= 4.5 ? STAMINA_LEVELS[5] : STAMINA_LEVELS[clampedLevel] || STAMINA_LEVELS[3];
  return { level: clampedLevel, text: locale === 'zh' ? texts.zh : texts.en };
}
