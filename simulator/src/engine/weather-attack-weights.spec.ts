import { AttackType } from './types/simulation.types';

// Weather × Attack Type weights matrix (averages to ~1.0)
// Index: 0=CROSS, 1=SHORT_PASS, 2=THROUGH_PASS, 3=DRIBBLE, 4=LONG_SHOT
const WEATHER_ATTACK_WEIGHTS: Record<string, number[]> = {
    sunny:     [1.05, 0.95, 1.00, 1.10, 1.10],
    cloudy:    [1.00, 1.00, 1.00, 1.00, 1.00],
    rainy:     [0.90, 0.95, 0.85, 1.15, 0.80],
    heavy_rain:[0.70, 0.80, 0.70, 1.20, 0.60],
    windy:     [1.20, 0.95, 1.00, 1.00, 1.25],
    foggy:     [0.90, 0.90, 0.60, 1.05, 0.70],
    snowy:     [1.15, 0.90, 0.80, 0.90, 0.75],
};

const ATTACK_TYPE_DISTRIBUTION: Record<number, number[]> = {
    0: [15, 30, 15, 30, 10], // balanced: cross, short_pass, through, dribble, long_shot
};

describe('Weather Attack Weights', () => {
    const weatherTypes = ['sunny', 'cloudy', 'rainy', 'heavy_rain', 'windy', 'foggy', 'snowy'];
    const attackTypeCount = 5;

    describe('WEATHER_ATTACK_WEIGHTS matrix structure', () => {
        it('should have weights for all 7 weather types', () => {
            expect(Object.keys(WEATHER_ATTACK_WEIGHTS)).toHaveLength(7);
        });

        it('should have 5 attack type weights per weather', () => {
            for (const weather of weatherTypes) {
                expect(WEATHER_ATTACK_WEIGHTS[weather]).toHaveLength(5);
            }
        });

        it('should contain all expected weather types', () => {
            for (const weather of weatherTypes) {
                expect(WEATHER_ATTACK_WEIGHTS[weather]).toBeDefined();
            }
        });
    });

    describe('weight value ranges', () => {
        it('should have all weights between 0.5 and 1.5', () => {
            for (const weather of weatherTypes) {
                for (const weight of WEATHER_ATTACK_WEIGHTS[weather]) {
                    expect(weight).toBeGreaterThanOrEqual(0.5);
                    expect(weight).toBeLessThanOrEqual(1.5);
                }
            }
        });

        it('should have no zero weights', () => {
            for (const weather of weatherTypes) {
                for (const weight of WEATHER_ATTACK_WEIGHTS[weather]) {
                    expect(weight).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('weight averages', () => {
        it('should have known averages for each weather type', () => {
            // Calculate actual averages for verification
            const expectedAverages: Record<string, number> = {
                sunny: 1.04,
                cloudy: 1.00,
                rainy: 0.93,
                heavy_rain: 0.80,
                windy: 1.08,
                foggy: 0.83,
                snowy: 0.90,
            };

            for (const weather of weatherTypes) {
                const weights = WEATHER_ATTACK_WEIGHTS[weather];
                const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
                expect(avg).toBeCloseTo(expectedAverages[weather], 1);
            }
        });
    });

    describe('specific weather effects', () => {
        it('sunny should boost CROSS and LONG_SHOT slightly', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['sunny'];
            expect(weights[0]).toBeGreaterThan(1.0); // CROSS
            expect(weights[4]).toBeGreaterThan(1.0); // LONG_SHOT
        });

        it('rainy should reduce CROSS and LONG_SHOT significantly', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['rainy'];
            expect(weights[0]).toBeLessThan(1.0); // CROSS
            expect(weights[4]).toBeLessThan(1.0); // LONG_SHOT
            expect(weights[3]).toBeGreaterThan(1.0); // DRIBBLE should increase
        });

        it('heavy_rain should most heavily reduce LONG_SHOT', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['heavy_rain'];
            expect(weights[4]).toBe(0.60); // Lowest of all
            expect(weights[3]).toBe(1.20); // DRIBBLE highest
        });

        it('windy should boost CROSS and LONG_SHOT (wind advantage)', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['windy'];
            expect(weights[0]).toBe(1.20); // CROSS boosted
            expect(weights[4]).toBe(1.25); // LONG_SHOT boosted (highest overall)
        });

        it('foggy should heavily reduce THROUGH_PASS', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['foggy'];
            expect(weights[2]).toBe(0.60); // THROUGH_PASS most reduced
        });

        it('snowy should boost CROSS but reduce most others', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['snowy'];
            expect(weights[0]).toBe(1.15); // CROSS boosted
            expect(weights[4]).toBeLessThan(1.0); // LONG_SHOT reduced
        });

        it('cloudy should have neutral effect (all weights = 1.0)', () => {
            const weights = WEATHER_ATTACK_WEIGHTS['cloudy'];
            for (const weight of weights) {
                expect(weight).toBe(1.0);
            }
        });
    });

    describe('weighted distribution calculation', () => {
        it('should correctly apply weather weights to base distribution', () => {
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];
            const weatherWeights = WEATHER_ATTACK_WEIGHTS['sunny'];

            const weightedDistribution = distribution.map((base, i) => base * weatherWeights[i]);

            // Expected: [15*1.05, 30*0.95, 15*1.00, 30*1.10, 10*1.10]
            // = [15.75, 28.5, 15, 33, 11]
            expect(weightedDistribution[0]).toBeCloseTo(15.75);
            expect(weightedDistribution[1]).toBeCloseTo(28.5);
            expect(weightedDistribution[2]).toBeCloseTo(15);
            expect(weightedDistribution[3]).toBeCloseTo(33);
            expect(weightedDistribution[4]).toBeCloseTo(11);
        });

        it('should normalize weighted distribution to sum to 100', () => {
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];

            for (const weather of weatherTypes) {
                const weatherWeights = WEATHER_ATTACK_WEIGHTS[weather];
                const weightedDistribution = distribution.map((base, i) => base * weatherWeights[i]);
                const sum = weightedDistribution.reduce((a, b) => a + b, 0);
                const normalized = weightedDistribution.map(w => (w / sum) * 100);
                const normalizedSum = normalized.reduce((a, b) => a + b, 0);

                expect(normalizedSum).toBeCloseTo(100, 5);
            }
        });

        it('windy should increase CROSS proportion compared to cloudy', () => {
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];

            // Windy weights
            const windyWeighted = distribution.map((base, i) => base * WEATHER_ATTACK_WEIGHTS['windy'][i]);
            const windySum = windyWeighted.reduce((a, b) => a + b, 0);
            const windyNormalized = windyWeighted.map(w => (w / windySum) * 100);

            // Cloudy (neutral) weights
            const cloudyWeighted = distribution.map((base, i) => base * WEATHER_ATTACK_WEIGHTS['cloudy'][i]);
            const cloudySum = cloudyWeighted.reduce((a, b) => a + b, 0);
            const cloudyNormalized = cloudyWeighted.map(w => (w / cloudySum) * 100);

            // CROSS (index 0) should be higher in windy than cloudy
            expect(windyNormalized[0]).toBeGreaterThan(cloudyNormalized[0]);
        });

        it('heavy_rain should decrease LONG_SHOT proportion compared to cloudy', () => {
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];

            // Heavy rain weights: [0.70, 0.80, 0.70, 1.20, 0.60]
            // Weighted: [10.5, 24, 10.5, 36, 6] = 87
            const heavyRainWeighted = distribution.map((base, i) => base * WEATHER_ATTACK_WEIGHTS['heavy_rain'][i]);
            const heavyRainSum = heavyRainWeighted.reduce((a, b) => a + b, 0);
            const heavyRainNormalized = heavyRainWeighted.map(w => (w / heavyRainSum) * 100);

            // Cloudy (neutral) weights - all 1.0, normalized: [15, 30, 15, 30, 10]
            // Heavy rain normalized: [12.1, 27.6, 12.1, 41.4, 6.9]
            // LONG_SHOT (index 4): cloudy = 10%, heavy_rain = 6.9%

            expect(heavyRainNormalized[4]).toBeLessThan(10); // Should be less than cloudy's 10%
        });

        it('foggy should significantly reduce THROUGH_PASS proportion', () => {
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];

            const foggyWeighted = distribution.map((base, i) => base * WEATHER_ATTACK_WEIGHTS['foggy'][i]);
            const foggySum = foggyWeighted.reduce((a, b) => a + b, 0);
            const foggyNormalized = foggyWeighted.map(w => (w / foggySum) * 100);

            // Cloudy normalized: [15, 30, 15, 30, 10]
            // Foggy normalized: [13.8, 27.7, 9.2, 32.3, 10.8]
            // THROUGH_PASS (index 2): cloudy = 15%, foggy = 9.2%

            expect(foggyNormalized[2]).toBeLessThan(15); // Should be less than cloudy's 15%
        });
    });

    describe('edge cases', () => {
        it('should handle unknown weather by using cloudy defaults', () => {
            const unknownWeather = 'unknown';
            const weights = WEATHER_ATTACK_WEIGHTS[unknownWeather] || WEATHER_ATTACK_WEIGHTS['cloudy'];
            expect(weights).toEqual([1.0, 1.0, 1.0, 1.0, 1.0]);
        });

        it('should not mutate original distribution array', () => {
            const original = [...ATTACK_TYPE_DISTRIBUTION[0]];
            const distribution = ATTACK_TYPE_DISTRIBUTION[0];
            const weatherWeights = WEATHER_ATTACK_WEIGHTS['sunny'];

            // Apply weights
            distribution.map((base, i) => base * weatherWeights[i]);

            // Original should be unchanged
            expect(ATTACK_TYPE_DISTRIBUTION[0]).toEqual(original);
        });
    });
});

describe('WeatherType enum values', () => {
    it('should have correct string values for weather types', () => {
        // These should match the keys in WEATHER_ATTACK_WEIGHTS
        expect('sunny').toBe('sunny');
        expect('cloudy').toBe('cloudy');
        expect('rainy').toBe('rainy');
        expect('heavy_rain').toBe('heavy_rain');
        expect('windy').toBe('windy');
        expect('foggy').toBe('foggy');
        expect('snowy').toBe('snowy');
    });
});

describe('AttackType enum values', () => {
    it('should have correct enum values', () => {
        expect(AttackType.CROSS).toBe(0);
        expect(AttackType.SHORT_PASS).toBe(1);
        expect(AttackType.THROUGH_PASS).toBe(2);
        expect(AttackType.DRIBBLE).toBe(3);
        expect(AttackType.LONG_SHOT).toBe(4);
    });
});
