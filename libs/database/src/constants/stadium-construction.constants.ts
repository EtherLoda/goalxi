/**
 * §5 Stadium — Time-based construction queue.
 *
 * Construction and demolish are no longer instant: the manager queues a
 * project in the Stadium page dialog, funds are locked (expand) or marked
 * for refund (demolish), and the new `stadium_construction` row ticks down
 * one week per weekly settlement cron until completion.
 *
 * Speed model:
 *   - expand:   5 000 seats per week  (10 000 seats ≈ 2 weeks)
 *   - demolish: 10 000 seats per week  (10 000 seats ≈ 1 week — faster than build)
 *
 * Capacity bounds mirror the existing instant endpoints in `stadium.service.ts`:
 *   - absolute max capacity: 200 000 (UI cap)
 *   - absolute min capacity: 1 000   (cannot demolish below this)
 */

/** Seats added per game week during an active expand. */
export const STADIUM_CONSTRUCTION_SEATS_PER_WEEK = 5_000;

/** Seats removed per game week during an active demolish (faster than build). */
export const STADIUM_DEMOLISH_SEATS_PER_WEEK = 10_000;

/** No project runs for fewer weeks than this — keeps the UX predictable. */
export const STADIUM_CONSTRUCTION_MIN_WEEKS = 1;

/** Minimum seats per queued project (matches `AdjustSeatsReqDto.delta.min`). */
export const STADIUM_CONSTRUCTION_MIN_SEATS = 500;

/** Hard cap on a single queued project — protects finance + UI sliders. */
export const STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB = 100_000;

/** Stadium capacity hard ceiling (mirrors the existing UI cap). */
export const STADIUM_MAX_CAPACITY = 200_000;

/** Stadium capacity hard floor — must always be able to host a match. */
export const STADIUM_MIN_CAPACITY = 1_000;

/**
 * Refund rate per seat when only a subset of seats is demolished
 * (the existing instant `demolishSeats` formula in `stadium.service.ts`
 * uses this; the full-stadium demolish uses the higher
 * {@link STADIUM_DEMOLISH_REFUND_RATE}).
 */
export const SEAT_DEMOLISH_REFUND_RATE = 0.15;

/** Step size for incremental seat adjustment in the existing endpoints. */
export const SEAT_ADJUST_STEP = 500;

/**
 * Compute the duration (in game weeks) of an expand project.
 * Always rounds up so a 5 001-seat expansion does not appear instant.
 */
export function computeConstructionWeeks(delta: number): number {
  return Math.max(
    STADIUM_CONSTRUCTION_MIN_WEEKS,
    Math.ceil(delta / STADIUM_CONSTRUCTION_SEATS_PER_WEEK),
  );
}

/**
 * Compute the duration (in game weeks) of a demolish project.
 * Faster than construction — demolishing 10 000 seats takes 1 week.
 */
export function computeDemolishWeeks(delta: number): number {
  return Math.max(
    STADIUM_CONSTRUCTION_MIN_WEEKS,
    Math.ceil(delta / STADIUM_DEMOLISH_SEATS_PER_WEEK),
  );
}