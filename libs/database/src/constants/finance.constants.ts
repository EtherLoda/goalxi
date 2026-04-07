export enum TransactionType {
  // 收入
  TICKET_INCOME = 'TICKET_INCOME',
  SPONSORSHIP = 'SPONSORSHIP',
  TRANSFER_IN = 'TRANSFER_IN',
  PRIZE_MONEY = 'PRIZE_MONEY',
  // 支出
  WAGES = 'WAGES',
  STAFF_WAGES = 'STAFF_WAGES',
  TRANSFER_OUT = 'TRANSFER_OUT',
  FACILITY_UPGRADE = 'FACILITY_UPGRADE',
  STADIUM_MAINTENANCE = 'STADIUM_MAINTENANCE',
  MEDICAL = 'MEDICAL',
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
  // 伤病医疗（天）
  MEDICAL_COST_PER_DAY: 1000,
} as const;

/**
 * Calculate player weekly wage based on individual skills
 *
 * Formula: wage = sum of (base + k * skill^n) for each skill >= 6
 * where n = 4.8, k = 0.02835, base = 179
 *
 * 6-skill reference (20 players per team):
 * - 6 skills@16: ~103,500
 * - 6 skills@14: ~55,000
 * - 6 skills@12: ~26,800
 * - 6 skills@10: ~11,800
 * - 6 skills@8: ~4,700
 * - 6 skills@6: ~2,000 (minimum wage)
 */
export function calculatePlayerWage(skills: number[]): number {
  const countableSkills = skills.filter(s => s >= 6);

  if (countableSkills.length === 0) {
    return 2000;
  }

  const n = 4.8;
  const k = 0.02835;
  const base = 179;

  const total = countableSkills.reduce((sum, s) => sum + base + k * Math.pow(s, n), 0);

  return Math.max(2000, Math.floor(Math.round(total) / 100) * 100);
}

/**
 * Test wage calculation with sample players
 */
export function testWageCalculation(): void {
  console.log('=== Player Wage Test ===\n');

  const testCases = [
    { name: 'Elite (18,18,18)', skills: [18, 18, 18, 10, 10, 10, 5, 5, 5] },
    { name: 'Top (15,15,15)', skills: [15, 15, 15, 12, 12, 8, 5, 5, 5] },
    { name: 'Good (12,12,12)', skills: [12, 12, 12, 10, 10, 7, 5, 5, 5] },
    { name: 'Average (10,10,10)', skills: [10, 10, 10, 8, 8, 6, 5, 5, 5] },
    { name: 'Low (7,7,7)', skills: [7, 7, 7, 5, 5, 5, 5, 5, 5] },
    { name: 'Minimum (6,6,6)', skills: [6, 6, 6, 5, 5, 5, 5, 5, 5] },
    { name: 'Mixed (18,15,12)', skills: [18, 15, 12, 5, 5, 5, 5, 5, 5] },
    { name: 'Poor (5,5,5)', skills: [5, 5, 5, 5, 5, 5, 5, 5, 5] },
  ];

  for (const tc of testCases) {
    const wage = calculatePlayerWage(tc.skills);
    console.log(`${tc.name}: ${wage.toLocaleString()}`);
  }
}
