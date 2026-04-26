export enum TransactionType {
  // 收入
  TICKET_INCOME = 'TICKET_INCOME',
  SPONSORSHIP = 'SPONSORSHIP',
  TRANSFER_IN = 'TRANSFER_IN',
  PRIZE_MONEY = 'PRIZE_MONEY',
  OTHER_INCOME = 'OTHER_INCOME',
  // 支出
  WAGES = 'WAGES',
  STAFF_EXPENSES = 'STAFF_EXPENSES',
  TRANSFER_OUT = 'TRANSFER_OUT',
  OTHER_EXPENSE = 'OTHER_EXPENSE',
  YOUTH_TEAM = 'YOUTH_TEAM',
}

export const FINANCE_CONSTANTS = {
  // 赞助商基础值（周）
  SPONSORSHIP_BASE: { 1: 100000, 2: 70000, 3: 50000, 4: 40000, 5: 30000 },
  // 员工工资（周）
  STAFF_WAGE: { 1: 2000, 2: 4000, 3: 8000, 4: 15000, 5: 25000 },
  // 球场维护费（周/每座位）
  STADIUM_MAINTENANCE_PER_SEAT: 2,
  // 青训运营（周）
  YOUTH_TEAM_COST: 50000,
} as const;

/**
 * 联赛排名奖金（赛季结束时发放）
 * 结构: { [tier]: { [position]: amount } }
 * Position 1=冠军, 2=亚军, 3-4=3-4名, 5-8=5-8名
 */
export const PRIZE_MONEY: { [tier: number]: { [position: number]: number } } = {
  // L1
  1: { 1: 6000000, 2: 3600000, 3: 2000000, 4: 2000000, 5: 1000000, 6: 1000000, 7: 1000000, 8: 1000000 },
  // L2
  2: { 1: 4000000, 2: 2400000, 3: 1300000, 4: 1300000, 5: 640000, 6: 640000, 7: 640000, 8: 640000 },
  // L3
  3: { 1: 2400000, 2: 1440000, 3: 800000, 4: 800000, 5: 400000, 6: 400000, 7: 400000, 8: 400000 },
  // L4
  4: { 1: 1600000, 2: 960000, 3: 520000, 4: 520000, 5: 260000, 6: 260000, 7: 260000, 8: 260000 },
  // L5+
  5: { 1: 1200000, 2: 720000, 3: 400000, 4: 400000, 5: 200000, 6: 200000, 7: 200000, 8: 200000 },
};

/**
 * Skill wage weights based on position-fit.util.ts analysis
 * Higher weight = skill contributes more to weekly wage
 */
export const SKILL_WAGE_WEIGHT: Record<string, number> = {
  // Outfield skills
  finishing: 1.30,
  defending: 1.00,
  dribbling: 1.20,
  passing: 1.05,
  positioning: 0.70,
  pace: 1.15,
  strength: 0.90,
  composure: 0.60,
};

export const GK_SKILL_WAGE_WEIGHT: Record<string, number> = {
  // Goalkeeper skills (independent scale)
  gk_reflexes: 1.40,
  gk_handling: 1.25,
  gk_aerial: 1.30,
  gk_positioning: 1.00,
};

// Set piece skills do not contribute to regular wage calculation
// Instead, they provide a bonus: 0.5% per level above 6
export const SET_PIECE_SKILL_BONUS_PER_LEVEL = 0.005;
export const SET_PIECE_SKILLS = ['freeKicks', 'penalties'];

/**
 * Calculate player weekly wage based on weighted skills
 *
 * Formula: wage = (sum of (base + k * (skill * skillWageWeight)^n) for each skill >= 6) * (1 + bonus%)
 * where n = 4.75, k = 0.025, base = 180
 * Set piece skills (freeKicks, penalties) do not contribute to base calculation,
 * but provide 0.5% bonus per level above 6
 *
 * Minimum wage: 2000
 *
 * Reference values:
 * - Outfield all 18: ~250,000
 * - Outfield all 17: ~190,800
 * - Outfield all 16: ~143,400
 * - GK all 18: ~170,900
 * - GK all 17: ~132,400
 * - GK all 16: ~101,600
 */
export function calculatePlayerWage(
  skillValues: number[],
  skillKeys: string[],
): number {
  const regularPairs: { value: number; weight: number }[] = [];
  let setPieceBonus = 0;

  for (let i = 0; i < skillValues.length; i++) {
    const value = skillValues[i];
    const key = skillKeys[i] || '';

    if (SET_PIECE_SKILLS.includes(key)) {
      // Set piece skills: no regular contribution, but +0.5% per level above 6
      if (value > 6) {
        setPieceBonus += (value - 6) * SET_PIECE_SKILL_BONUS_PER_LEVEL;
      }
    } else if (value >= 6) {
      // Regular skills
      const weight = GK_SKILL_WAGE_WEIGHT[key] ?? SKILL_WAGE_WEIGHT[key] ?? 1.0;
      regularPairs.push({ value, weight });
    }
  }

  if (regularPairs.length === 0 && setPieceBonus === 0) {
    return 2000;
  }

  const n = 4.75;
  const k = 0.025;
  const base = 180;

  // Calculate base wage from regular skills
  let total = 0;
  if (regularPairs.length > 0) {
    total = regularPairs.reduce((sum, pair) => {
      return sum + base + k * Math.pow(pair.value * pair.weight, n);
    }, 0);
  }

  // Apply set piece bonus multiplier
  const multiplier = 1 + setPieceBonus;
  const finalWage = total * multiplier;

  return Math.max(2000, Math.floor(Math.round(finalWage) / 100) * 100);
}

/**
 * Test wage calculation with sample players
 */
export function testWageCalculation(): void {
  console.log('=== Player Wage Test (n=4.75, k=0.025, base=180) ===\n');

  const outfieldKeys = ['pace', 'strength', 'finishing', 'passing', 'dribbling', 'defending', 'positioning'];

  const testCases = [
    { name: 'Outfield all 18', skills: [18, 18, 18, 18, 18, 18, 18] },
    { name: 'Outfield all 17', skills: [17, 17, 17, 17, 17, 17, 17] },
    { name: 'Outfield all 16', skills: [16, 16, 16, 16, 16, 16, 16] },
    { name: 'GK all 18', skills: [18, 18, 14], keys: ['gk_reflexes', 'gk_handling', 'gk_distribution'] },
    { name: 'GK all 17', skills: [17, 17, 14], keys: ['gk_reflexes', 'gk_handling', 'gk_distribution'] },
    { name: 'GK all 16', skills: [16, 16, 14], keys: ['gk_reflexes', 'gk_handling', 'gk_distribution'] },
    { name: 'Outfield 18 + FK18', skills: [18, 18, 18, 18, 18, 18, 18, 18], keys: [...outfieldKeys, 'freeKicks'] },
    { name: 'Outfield 18 + FK18 + P18', skills: [18, 18, 18, 18, 18, 18, 18, 18, 18], keys: [...outfieldKeys, 'freeKicks', 'penalties'] },
  ];

  for (const tc of testCases) {
    const keys = tc.keys || outfieldKeys;
    const wage = calculatePlayerWage(tc.skills, keys);
    console.log(`${tc.name}: ${wage.toLocaleString()}`);
  }
}
