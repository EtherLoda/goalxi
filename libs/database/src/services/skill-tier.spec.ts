import {
    SKILL_TIERS,
    getSkillTierLabel,
    type SkillTierLevel,
} from './skill-tier';

describe('Skill Tier Labels', () => {
    describe('SKILL_TIERS source-of-truth grid', () => {
        it('should expose exactly 21 tiers (L0-L20)', () => {
            expect(SKILL_TIERS).toHaveLength(21);
        });

        it('should index by level (array index === tier.level for all rows)', () => {
            SKILL_TIERS.forEach((tier, idx) => {
                expect(tier.level).toBe(idx);
            });
        });

        it('should provide both zh and en labels for every tier', () => {
            for (const tier of SKILL_TIERS) {
                expect(typeof tier.zh).toBe('string');
                expect(typeof tier.en).toBe('string');
                expect(tier.zh.length).toBeGreaterThan(0);
                expect(tier.en.length).toBeGreaterThan(0);
            }
        });
    });

    describe('getSkillTierLabel() - full 21-level grid (zh + en)', () => {
        const cases: Array<[SkillTierLevel, string, string]> = [
            [0,  'None',              '无'],
            [1,  'Terrible',          '糟糕'],
            [2,  'Poor',              '差劲'],
            [3,  'Mediocre',          '平庸'],
            [4,  'Average',           '一般'],
            [5,  'Competent',         '合格'],
            [6,  'Satisfactory',      '差强人意'],
            [7,  'Good',              '良好'],
            [8,  'Excellent',         '优秀'],
            [9,  'Formidable',        '强大'],
            [10, 'Outstanding',       '杰出'],
            [11, 'Superb',            '精湛'],
            [12, 'Apex',              '顶尖'],
            [13, 'Superior',          '卓越'],
            [14, 'World-Class',       '超一流'],
            [15, 'Magnificent',       '卓绝'],
            [16, 'Exceptional',       '出类拔萃'],
            [17, 'Peerless',          '举世无双'],
            [18, 'Unmatched',         '登峰造极'],
            [19, 'Transcendent',      '空前绝后'],
            [20, 'Beyond Compare',    '化境'],
        ];

        for (const [level, en, zh] of cases) {
            it('level ' + level + ' -> ' + en, () => {
                expect(getSkillTierLabel(level, 'en')).toBe(en);
                expect(getSkillTierLabel(level, 'zh')).toBe(zh);
            });
        }
    });

    describe('getSkillTierLabel() - out-of-range clamping', () => {
        it('should return L0 label for negative levels', () => {
            expect(getSkillTierLabel(-1, 'en')).toBe('None');
            expect(getSkillTierLabel(-100, 'zh')).toBe('无');
        });

        it('should return L20 label for levels above 20', () => {
            expect(getSkillTierLabel(21, 'en')).toBe('Beyond Compare');
            expect(getSkillTierLabel(1000, 'zh')).toBe('化境');
        });

        it('should floor non-integer levels (7.9 -> tier 7)', () => {
            expect(getSkillTierLabel(7.9, 'en')).toBe('Good');
            expect(getSkillTierLabel(7.9, 'zh')).toBe('良好');
        });

        it('should return L0 for NaN / Infinity', () => {
            expect(getSkillTierLabel(NaN, 'en')).toBe('None');
            expect(getSkillTierLabel(Infinity, 'en')).toBe('None');
        });
    });

    describe('getSkillTierLabel() - default locale', () => {
        it('should default to en when locale is omitted', () => {
            expect(getSkillTierLabel(10)).toBe('Outstanding');
            expect(getSkillTierLabel(0)).toBe('None');
            expect(getSkillTierLabel(20)).toBe('Beyond Compare');
        });
    });

    describe('Semantic reachability - covers both skills and experience', () => {
        it('skill attribute values 0-20 (e.g. pace, finishing) all map to a tier', () => {
            for (let v = 0; v <= 20; v++) {
                expect(typeof getSkillTierLabel(v, 'en')).toBe('string');
            }
            expect(getSkillTierLabel(0, 'en')).toBe('None');
            expect(getSkillTierLabel(1, 'en')).toBe('Terrible');
        });

        it('experience level 0 maps to None (unranked rookie)', () => {
            expect(getSkillTierLabel(0, 'en')).toBe('None');
            expect(getSkillTierLabel(0, 'zh')).toBe('无');
        });

        it('experience level 17-20 (typical 13-season career) hits Peerless -> Beyond Compare', () => {
            expect(getSkillTierLabel(17, 'en')).toBe('Peerless');
            expect(getSkillTierLabel(20, 'en')).toBe('Beyond Compare');
        });
    });
});
