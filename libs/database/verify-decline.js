// One-off verification script for the player-decline curve.
// Run with: `node verify-decline.js` from libs/database after `pnpm build`.

const {
    applyWeeklyDecline,
    DECLINE_START_AGE,
    DECLINE_BASE_RATE,
    DECLINE_CURVE_EXPONENT,
    DECLINE_SKILL_FLOOR,
    DECLINE_CATEGORY_MULTIPLIER,
} = require('./dist/services/player-decline');

function simulate(weeks, startAge, category, skillKey, startValue, random = () => 0.5) {
    const player = {
        currentSkills: { [category]: { [skillKey]: startValue } },
        age: startAge,
    };
    for (let w = 0; w < weeks; w++) {
        player.age = Math.floor(startAge + w / 16);
        applyWeeklyDecline(player, random);
    }
    player.age = Math.floor(startAge + weeks / 16);
    return player.currentSkills[category][skillKey];
}

const yearsToWeeks = (y) => y * 16;

const SKILL_KEY_BY_CATEGORY = {
    physical: 'pace',
    technical: 'finishing',
    mental: 'positioning',
    setPieces: 'freeKicks',
};

function table(headers, rows) {
    const widths = headers.map((h, i) =>
        Math.max(h.length, ...rows.map((r) => String(r[i]).length)),
    );
    const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
    const fmt = (cells) =>
        '|' +
        cells.map((c, i) => ` ${String(c).padEnd(widths[i])} `).join('|') +
        '|';
    console.log(sep);
    console.log(fmt(headers));
    console.log(sep);
    for (const r of rows) console.log(fmt(r));
    console.log(sep);
}

console.log(
    `\nDECLINE PARAMS: baseRate=${DECLINE_BASE_RATE}  exp=${DECLINE_CURVE_EXPONENT}  ` +
        `startAge=${DECLINE_START_AGE}  floor=${DECLINE_SKILL_FLOOR}`,
);
console.log(
    'CATEGORIES: physical=' +
        DECLINE_CATEGORY_MULTIPLIER.physical +
        ' technical=' +
        DECLINE_CATEGORY_MULTIPLIER.technical +
        ' mental=' +
        DECLINE_CATEGORY_MULTIPLIER.mental +
        ' setPieces=' +
        DECLINE_CATEGORY_MULTIPLIER.setPieces,
);

// =============================================================
// Table 1: physical (peak 18) every year
// =============================================================
console.log('\n=== Table 1: PHYSICAL (peak 18) every year ===');
{
    const PEAK = 18;
    const yearPoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rows = [];
    for (const years of yearPoints) {
        const age = 28 + years;
        const final = simulate(yearsToWeeks(years), 28, 'physical', 'pace', PEAK);
        const lost = PEAK - final;
        const pct = ((final / PEAK) * 100).toFixed(1);
        const hitFloor = final <= DECLINE_SKILL_FLOOR + 1e-6 ? ' [FLOOR]' : '';
        const halved = years >= 7 ? ' (50% lost)' : '';
        rows.push([
            `+${years}y → ${age}`,
            final.toFixed(2),
            lost.toFixed(2),
            `${pct}%` + hitFloor + halved,
        ]);
    }
    table(['Elapsed', 'Skill', 'Lost', '% of peak'], rows);
}

// =============================================================
// Table 2: All 4 categories at peak 18, every year
// =============================================================
console.log('\n=== Table 2: all 4 categories at peak 18, every year ===');
{
    const yearPoints = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const rows = [];
    for (const years of yearPoints) {
        const age = 28 + years;
        const row = [`+${years}y → ${age}`];
        for (const cat of ['physical', 'technical', 'mental', 'setPieces']) {
            const key = SKILL_KEY_BY_CATEGORY[cat];
            const final = simulate(yearsToWeeks(years), 28, cat, key, 18);
            row.push(final.toFixed(2));
        }
        rows.push(row);
    }
    table(['Elapsed', 'physical', 'technical', 'mental', 'setPieces'], rows);
}

// =============================================================
// Table 3: PHYSICAL — 4 starting levels (18/16/14/12)
// =============================================================
console.log('\n=== Table 3: PHYSICAL — 4 starting levels × years ===');
{
    const yearPoints = [0, 2, 4, 6, 7, 8, 9];
    const rows = [];
    for (const start of [18, 16, 14, 12]) {
        const row = [`${start}`];
        for (const years of yearPoints) {
            const final = simulate(yearsToWeeks(years), 28, 'physical', 'pace', start);
            row.push(final.toFixed(2));
        }
        rows.push(row);
    }
    const headers = ['Start', ...yearPoints.map((y) => `+${y}y (${28 + y})`)];
    table(headers, rows);
}

// =============================================================
// Table 4: TECHNICAL — 4 starting levels
// =============================================================
console.log('\n=== Table 4: TECHNICAL — 4 starting levels × years ===');
{
    const yearPoints = [0, 2, 4, 6, 7, 8, 9];
    const rows = [];
    for (const start of [18, 16, 14, 12]) {
        const row = [`${start}`];
        for (const years of yearPoints) {
            const final = simulate(
                yearsToWeeks(years),
                28,
                'technical',
                'finishing',
                start,
            );
            row.push(final.toFixed(2));
        }
        rows.push(row);
    }
    const headers = ['Start', ...yearPoints.map((y) => `+${y}y (${28 + y})`)];
    table(headers, rows);
}

// =============================================================
// Table 5: MENTAL — 4 starting levels (slower decline)
// =============================================================
console.log('\n=== Table 5: MENTAL — 4 starting levels × years ===');
{
    const yearPoints = [0, 4, 6, 8, 10, 12];
    const rows = [];
    for (const start of [18, 16, 14, 12]) {
        const row = [`${start}`];
        for (const years of yearPoints) {
            const final = simulate(
                yearsToWeeks(years),
                28,
                'mental',
                'positioning',
                start,
            );
            row.push(final.toFixed(2));
        }
        rows.push(row);
    }
    const headers = ['Start', ...yearPoints.map((y) => `+${y}y (${28 + y})`)];
    table(headers, rows);
}

// =============================================================
// Table 6: SETPIECES — 4 starting levels (slowest decline)
// =============================================================
console.log('\n=== Table 6: SETPIECES — 4 starting levels × years ===');
{
    const yearPoints = [0, 4, 8, 10, 12, 14];
    const rows = [];
    for (const start of [18, 16, 14, 12]) {
        const row = [`${start}`];
        for (const years of yearPoints) {
            const final = simulate(
                yearsToWeeks(years),
                28,
                'setPieces',
                'freeKicks',
                start,
            );
            row.push(final.toFixed(2));
        }
        rows.push(row);
    }
    const headers = ['Start', ...yearPoints.map((y) => `+${y}y (${28 + y})`)];
    table(headers, rows);
}

// =============================================================
// Table 7: floor-hit age by starting level × category
// =============================================================
console.log('\n=== Table 7: floor-hit age by starting level × category ===');
{
    const startLevels = [18, 16, 14, 12];
    const cats = ['physical', 'technical', 'mental', 'setPieces'];
    const rows = [];
    for (const start of startLevels) {
        const row = [`${start}`];
        for (const cat of cats) {
            const key = SKILL_KEY_BY_CATEGORY[cat];
            let floorAge = '>45';
            for (let years = 0; years <= 17; years++) {
                const final = simulate(yearsToWeeks(years), 28, cat, key, start);
                if (final <= DECLINE_SKILL_FLOOR + 1e-6) {
                    floorAge = `${28 + years}`;
                    break;
                }
            }
            row.push(floorAge);
        }
        rows.push(row);
    }
    table(['Start', 'physical', 'technical', 'mental', 'setPieces'], rows);
}

// =============================================================
// Table 8: SANITY — spec promise check
// =============================================================
console.log('\n=== Table 8: spec promise — peak 18 physical halved by 34-35 ===');
{
    const final34 = simulate(yearsToWeeks(34 - 28), 28, 'physical', 'pace', 18);
    const final35 = simulate(yearsToWeeks(35 - 28), 28, 'physical', 'pace', 18);
    const lost34 = 18 - final34;
    const lost35 = 18 - final35;
    const pct34 = ((1 - final34 / 18) * 100).toFixed(1);
    const pct35 = ((1 - final35 / 18) * 100).toFixed(1);
    console.log(
        `    age 34: ${final34.toFixed(2)}  (lost ${lost34.toFixed(2)}, ${pct34}% of peak)`,
    );
    console.log(
        `    age 35: ${final35.toFixed(2)}  (lost ${lost35.toFixed(2)}, ${pct35}% of peak)`,
    );
    const halvedAt35 = pct35 > 50;
    console.log(
        `    spec promise "halved by 34-35" → ${halvedAt35 ? '✓ PASS (at age 35)' : '✗ FAIL'}`,
    );
}
