/**
 * 球场等级 —— 一座"通行证",不是一张"收益表"。
 *
 * A level grants NO revenue of its own. It only raises the ceiling on how
 * many seats the ground is allowed to hold. Ticket income still comes from
 * `capacity × attendance × price`, so a large ground in a club that cannot
 * fill it is a liability (every seat costs upkeep every week) rather than an
 * advantage.
 *
 * That is deliberate: the economy must not hand an established club a
 * permanent multiplier over a new one. The stadium already accumulates as a
 * permanent asset through capacity, and capacity only pays while the club is
 * successful enough to fill it — which is exactly the pressure the league
 * needs. Adding a per-seat price multiplier on top would compound that into
 * an advantage nobody can catch up with.
 *
 * Ladder: level 1 = 20,000 seats, every further level +20,000.
 *   L1 20,000 · L2 40,000 · L3 60,000 · L4 80,000 · L5 100,000
 */
export const STADIUM_MAX_LEVEL = 5;

/** Seats unlocked per level. Level N may hold N × this many seats. */
export const STADIUM_CAPACITY_PER_LEVEL = 20_000;

/**
 * Seats a given level allows. Clamped to [1, STADIUM_MAX_LEVEL] so a bad
 * row can never grant an unbounded ceiling.
 */
export function stadiumCapacityCap(level: number): number {
  const clamped = Math.min(
    STADIUM_MAX_LEVEL,
    Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)),
  );
  return clamped * STADIUM_CAPACITY_PER_LEVEL;
}

/**
 * One-off cost of reaching each level. Level 1 is the starting state, so it
 * has no entry. These are the main brake on the ladder — they compete with
 * capacity expansion, transfers and wages for the same cash.
 */
export const STADIUM_LEVEL_UPGRADE_COST: Readonly<Record<number, number>> = {
  2: 150_000,
  3: 500_000,
  4: 1_500_000,
  5: 4_000_000,
};

/**
 * Weeks the upgrade occupies the construction queue. The queue is exclusive
 * (one project per team), so this is real opportunity cost: it is time the
 * club is not expanding.
 */
export const STADIUM_LEVEL_UPGRADE_WEEKS: Readonly<Record<number, number>> = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
};

/** Cost of reaching `targetLevel`, or null when the level is not purchasable. */
export function stadiumUpgradeCost(targetLevel: number): number | null {
  return STADIUM_LEVEL_UPGRADE_COST[targetLevel] ?? null;
}

/** Weeks needed to reach `targetLevel`, or null when not purchasable. */
export function stadiumUpgradeWeeks(targetLevel: number): number | null {
  return STADIUM_LEVEL_UPGRADE_WEEKS[targetLevel] ?? null;
}

/**
 * Smallest level whose capacity cap accommodates `capacity`.
 *
 * Used by the backfill migration so no existing ground is shrunk by the
 * introduction of levels, and by tests.
 */
export function stadiumLevelForCapacity(capacity: number): number {
  const seats = Number.isFinite(capacity) ? Math.max(0, capacity) : 0;
  const level = Math.ceil(seats / STADIUM_CAPACITY_PER_LEVEL);
  return Math.min(STADIUM_MAX_LEVEL, Math.max(1, level));
}
