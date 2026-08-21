import { PlayerEntity } from '../entities/player.entity';
import {
    DECLINE_BASE_RATE,
    DECLINE_CATEGORY_MULTIPLIER,
    DECLINE_SKILL_FLOOR,
    DECLINE_START_AGE,
    applyWeeklyDecline,
    calculateDeclinedSkill,
} from './player-decline';

/** Build a minimal PlayerEntity-shaped object for the pure-function specs.
 *  No DB connection, no `AbstractEntity` constructor — the decline code
 *  only ever reads `currentSkills` and `age` so this stub is sufficient. */
function makePlayer(opts: {
    age: number;
    pace?: number;
    strength?: number;
    finishing?: number;
    passing?: number;
    dribbling?: number;
    defending?: number;
    positioning?: number;
    composure?: number;
    freeKicks?: number;
    penalties?: number;
}): PlayerEntity {
    return {
        age: opts.age,
        currentSkills: {
            physical: { pace: opts.pace ?? 18, strength: opts.strength ?? 18 },
            technical: {
                finishing: opts.finishing ?? 18,
                passing: opts.passing ?? 18,
                dribbling: opts.dribbling ?? 18,
                defending: opts.defending ?? 18,
            },
            mental: { positioning: opts.positioning ?? 18, composure: opts.composure ?? 18 },
            setPieces: { freeKicks: opts.freeKicks ?? 18, penalties: opts.penalties ?? 18 },
        },
    } as unknown as PlayerEntity;
}

/** Advance the player by one real week and re-apply decline. The pure
 *  function reads `player.age` on every call so we just bump the
 *  underlying field. Mirrors what the worker does when iterating. */
function advanceOneWeek(player: PlayerEntity, random: () => number): void {
    applyWeeklyDecline(player, random);
    // daysAlive is the source-of-truth for `PlayerEntity.age`; bumping
    // it by 7 (= one real week) flips the integer age boundary every
    // 16 iterations. The test doesn't have a real `daysAlive`, so we
    // recompute `age` directly here. The production worker uses the
    // real getter — this shortcut only matters in the unit test.
    (player as unknown as { age: number }).age += 0; // no-op; the loop below sets it
}

describe('calculateDeclinedSkill', () => {
    it('returns the original value below the start age (no decline under 28)', () => {
        const r = calculateDeclinedSkill(27, 'physical', 18, () => 0.5);
        expect(r.value).toBe(18);
        expect(r.floored).toBe(false);
    });

    it('returns the original value exactly at age 28 (entry point, no decline yet)', () => {
        const r = calculateDeclinedSkill(28, 'physical', 18, () => 0.5);
        expect(r.value).toBe(18);
        expect(r.floored).toBe(false);
    });

    it('declines physical at age 30 by the calibrated per-week amount', () => {
        // 0.013 * 2^1.5 (age-28)^p * 1.0 (physical) * 1.0 (jitter @ random=0.5)
        // = 0.013 * 2.8284 = 0.036769
        const r = calculateDeclinedSkill(30, 'physical', 18, () => 0.5);
        expect(r.value).toBeCloseTo(18 - 0.03677, 4);
        expect(r.floored).toBe(false);
    });

    it('declines physical at age 34 substantially (single week)', () => {
        // 0.013 * 6^1.5 = 0.013 * 14.697 = 0.19106 per week
        const r = calculateDeclinedSkill(34, 'physical', 18, () => 0.5);
        expect(r.value).toBeCloseTo(18 - 0.19106, 3);
        expect(r.floored).toBe(false);
    });

    it('clamps to the skill floor when decline would push below the floor', () => {
        // age 40, current 5.5: 0.013 * 12^1.5 = 0.013 * 41.569 = 0.5404 lost
        // 5.5 - 0.5404 = 4.96 ≤ floor 5 → clamp
        const r = calculateDeclinedSkill(40, 'physical', 5.5, () => 0.5);
        expect(r.value).toBe(DECLINE_SKILL_FLOOR);
        expect(r.floored).toBe(true);
    });

    it('passes a value already at the floor through unchanged (no false floored flag)', () => {
        const r = calculateDeclinedSkill(40, 'physical', DECLINE_SKILL_FLOOR, () => 0.5);
        expect(r.value).toBe(DECLINE_SKILL_FLOOR);
        expect(r.floored).toBe(false);
    });

    it('respects the category multiplier (mental declines slower than physical)', () => {
        // Same age, same random, different category — mental should
        // decline at 0.4x the physical rate.
        const physical = calculateDeclinedSkill(34, 'physical', 18, () => 0.5);
        const mental = calculateDeclinedSkill(34, 'mental', 18, () => 0.5);
        const physicalLoss = 18 - physical.value;
        const mentalLoss = 18 - mental.value;
        expect(mentalLoss).toBeCloseTo(physicalLoss * 0.4, 5);
    });

    it('respects the jitter band (random=0 → −15%, random=1 → +15%)', () => {
        const min = calculateDeclinedSkill(34, 'physical', 18, () => 0);
        const max = calculateDeclinedSkill(34, 'physical', 18, () => 1);
        const minLoss = 18 - min.value;
        const maxLoss = 18 - max.value;
        // 0.19106 base * 0.85 = 0.16240; * 1.15 = 0.21972
        expect(minLoss).toBeCloseTo(0.19106 * 0.85, 5);
        expect(maxLoss).toBeCloseTo(0.19106 * 1.15, 5);
        expect(maxLoss).toBeGreaterThan(minLoss);
    });
});

describe('applyWeeklyDecline (cumulative, calibrated against the plan)', () => {
    /**
     * Run N real weeks of decline, advancing the integer age by 1 every
     * 16 weeks. `daysAlive` is the source-of-truth in production but the
     * spec stubs it by directly rewriting `player.age` so the math is
     * exposed rather than hidden behind the getter. Stamping the age
     * from the loop counter (not a `currentAge` walker) is what keeps
     * the final age aligned with `startAge + weeks/16` after the loop.
     */
    function runWeeks(player: PlayerEntity, weeks: number, random: () => number): void {
        const startAge = player.age;
        for (let w = 0; w < weeks; w++) {
            const ageNow = Math.floor(startAge + w / 16);
            (player as unknown as { age: number }).age = ageNow;
            applyWeeklyDecline(player, random);
        }
        // Stamp the post-loop age so callers can assert on it.
        (player as unknown as { age: number }).age = Math.floor(startAge + weeks / 16);
    }

    it('produces zero deltas for a player below DECLINE_START_AGE', () => {
        const player = makePlayer({ age: 25 });
        const result = applyWeeklyDecline(player, () => 0.5);
        expect(result.deltas).toEqual([]);
        expect(result.totalLost).toBe(0);
        expect(result.hitFloor).toBe(false);
        expect(player.currentSkills.physical.pace).toBe(18);
    });

    it('SKILL-CALIBRATION: physical skills lose ~8.9 over 6 game years (28→35), peak 18 → ~9.1 (just halved)', () => {
        // 16 weeks at each of ages 29, 30, 31, 32, 33, 34 = 96 weeks of
        // decline plus 16 weeks at age 34 = 112 weeks total. After
        // 7 game years the player has just turned 35. The "halved
        // by 34-35" promise is satisfied here.
        //
        // Discrete sum (a=0.013, p=1.5):
        //   16 × 0.013 × (1^1.5 + 2^1.5 + 3^1.5 + 4^1.5 + 5^1.5 + 6^1.5)
        //   = 16 × 0.013 × 42.91 = 8.92
        //
        // The plan-level contract is "halved by 34-35" — peak 18 → 9.08
        // is just over half. Categories are scaled by their
        // multiplier, so:
        //   physical:    18 − 8.92 ≈ 9.08  (just over half ✓)
        //   technical:   18 − 0.7 × 8.92 ≈ 11.76
        //   mental:      18 − 0.4 × 8.92 ≈ 14.43
        //   setPieces:   18 − 0.2 × 8.92 ≈ 16.22
        const player = makePlayer({ age: 28, pace: 18, strength: 18 });
        runWeeks(player, 112, () => 0.5);

        // After 112 weeks the player has just turned 35.
        expect(player.age).toBe(35);
        // physical: peak 18 → ~9.1 (just over half ✓)
        expect(player.currentSkills.physical.pace).toBeCloseTo(9.1, 0);
        expect(player.currentSkills.physical.strength).toBeCloseTo(9.1, 0);
        // technical: peak 18 → ~11.8
        const tech = player.currentSkills.technical as {
            finishing: number;
            passing: number;
            dribbling: number;
            defending: number;
        };
        expect(tech.finishing).toBeCloseTo(11.8, 0);
        // mental: peak 18 → ~14.4
        expect(player.currentSkills.mental.positioning).toBeCloseTo(14.4, 0);
        // setPieces: peak 18 → ~16.2
        expect(player.currentSkills.setPieces.freeKicks).toBeCloseTo(16.2, 0);
    });

    it('physical skills hit the skill floor (5) by age 37', () => {
        // 16 weeks at each of ages 29..36 = 144 weeks total. After
        // 9 game years the player has just turned 37.
        //
        // Discrete sum (a=0.013, p=1.5): 16 × 0.013 × Σ(y-28)^1.5
        // for y in {29,30,31,32,33,34,35,36} = 16 × 0.013 × 88.18 = 18.34
        // Peak 18 − 18.34 = -0.34 → clamps to 5.
        const player = makePlayer({ age: 28, pace: 18, strength: 18 });
        runWeeks(player, 144, () => 0.5);

        expect(player.age).toBe(37);
        expect(player.currentSkills.physical.pace).toBe(DECLINE_SKILL_FLOOR);
        expect(player.currentSkills.physical.strength).toBe(DECLINE_SKILL_FLOOR);
    });

    it('a skill already at the floor stays at the floor across many weeks (no negative drift)', () => {
        const player = makePlayer({ age: 28, pace: DECLINE_SKILL_FLOOR });
        runWeeks(player, 200, () => 0.5); // far past 35 — would otherwise be hugely negative
        expect(player.currentSkills.physical.pace).toBe(DECLINE_SKILL_FLOOR);
    });

    it('returns an empty delta list for a player whose every skill is at the floor', () => {
        // All 10 outfield skills pinned at the floor. Decline should
        // run the loop but produce no `deltas` entries (no-op).
        const player = {
            age: 40,
            currentSkills: {
                physical: { pace: 5, strength: 5 },
                technical: { finishing: 5, passing: 5, dribbling: 5, defending: 5 },
                mental: { positioning: 5, composure: 5 },
                setPieces: { freeKicks: 5, penalties: 5 },
            },
        } as unknown as PlayerEntity;
        const result = applyWeeklyDecline(player, () => 0.5);
        expect(result.deltas).toEqual([]);
        expect(result.totalLost).toBe(0);
        expect(result.hitFloor).toBe(false);
    });

    it('returns an empty result for a player with no currentSkills payload', () => {
        const player = { age: 32, currentSkills: null } as unknown as PlayerEntity;
        const result = applyWeeklyDecline(player, () => 0.5);
        expect(result.deltas).toEqual([]);
        expect(result.totalLost).toBe(0);
    });

    it('rounds the new skill value to 2 decimals (matches youth-progression convention)', () => {
        // 0.013 * 2^1.5 * 1.0 (physical) * 1.0 (jitter @ random=0.5)
        // = 0.013 * 2.828 = 0.0368 → 18 - 0.0368 = 17.9632
        // → parseFloat(17.9632.toFixed(2)) === 17.96
        // All 10 skills on a default player sit at 18, so all 10
        // produce deltas; we assert on the pace value (a physical
        // skill with multiplier 1.0 → biggest decline) plus the
        // delta-record shape.
        const player = makePlayer({ age: 30, pace: 18 });
        const result = applyWeeklyDecline(player, () => 0.5);
        expect(result.deltas.length).toBe(10);
        const paceDelta = result.deltas.find((d) => d.skillKey === 'pace');
        expect(paceDelta).toBeDefined();
        expect(paceDelta?.after).toBe(17.96);
        expect(player.currentSkills.physical.pace).toBe(17.96);
    });

    it('uses Math.random by default (jitter is non-deterministic) — both calls land in the jitter band', () => {
        const a = makePlayer({ age: 30, pace: 18 });
        const b = makePlayer({ age: 30, pace: 18 });
        // No random argument → falls through to Math.random. We don't
        // assert that the two calls differ (that's a flake waiting to
        // happen) — we assert that both land in the documented
        // [0.85×, 1.15×] jitter band around the calibrated 0.0368
        // per-week decline (a=0.013, p=1.5, age 30). The band is
        // widened by 2dp rounding drift (0.005 either side of the
        // continuous band edges) — e.g. 0.85 × 0.0368 = 0.03128
        // rounds down to a stored 0.03.
        applyWeeklyDecline(a);
        applyWeeklyDecline(b);
        const aLost = 18 - a.currentSkills.physical.pace;
        const bLost = 18 - b.currentSkills.physical.pace;
        // 0.0368 * 0.85 = 0.03128; rounds to 0.03
        // 0.0368 * 1.15 = 0.04232; rounds to 0.04
        expect(aLost).toBeGreaterThanOrEqual(0.03);
        expect(aLost).toBeLessThanOrEqual(0.04);
        expect(bLost).toBeGreaterThanOrEqual(0.03);
        expect(bLost).toBeLessThanOrEqual(0.04);
    });

    it('hitFloor flag is true when at least one skill lands in the clamp', () => {
        // age 40 with skills at 5.5 — single-week loss for
        // physical = 0.013 * 12^1.5 * 1.0 * 1.0 = 0.5404
        // → 5.5 - 0.5404 = 4.96 → clamp to 5, floored.
        const player = makePlayer({ age: 40, pace: 5.5 });
        const result = applyWeeklyDecline(player, () => 0.5);
        expect(player.currentSkills.physical.pace).toBe(DECLINE_SKILL_FLOOR);
        expect(result.hitFloor).toBe(true);
    });
});

describe('constants and shapes', () => {
    it('exports the documented calibration constants', () => {
        expect(DECLINE_START_AGE).toBe(28);
        expect(DECLINE_BASE_RATE).toBe(0.013);
        expect(DECLINE_SKILL_FLOOR).toBe(5);
    });

    it('category multipliers follow the physical→setPieces ordering', () => {
        expect(DECLINE_CATEGORY_MULTIPLIER.physical).toBeGreaterThan(
            DECLINE_CATEGORY_MULTIPLIER.technical,
        );
        expect(DECLINE_CATEGORY_MULTIPLIER.technical).toBeGreaterThan(
            DECLINE_CATEGORY_MULTIPLIER.mental,
        );
        expect(DECLINE_CATEGORY_MULTIPLIER.mental).toBeGreaterThan(
            DECLINE_CATEGORY_MULTIPLIER.setPieces,
        );
    });
});
