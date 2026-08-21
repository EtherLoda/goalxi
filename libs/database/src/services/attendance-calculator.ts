import { getFanCap } from '../entities/fan.entity';

/**
 * Compute the home-side match attendance for a single fixture.
 *
 * Pure function — no DB, no service, no class state. Same definition
 * was lifted from `api/src/api/fan/fan.service.ts:calculateAttendance`
 * so the settlement scheduler's preprocess tick can write the
 * number into `match.attendance` BEFORE the simulator picks it up
 * (`simulation.processor.ts:725` → `match.attendance ?? 0` →
 * `attendance_announcement` event payload). Pre-fix, the column was
 * null at preprocess time and the event fired with `attendance: 0`
 * for every match, regardless of how many fans actually showed up —
 * the live page rendered "Attendance 0" forever (until completion
 * 90+ minutes later overwrote it). With this in libs/database both
 * the API (FanService) and the Settlement (MatchSchedulerService) can
 * compute the same number without an HTTP roundtrip.
 *
 * The five input pairs mirror the rows the previous API service read
 * (home/away fan counts, home/away fan morale, stadium capacity) plus
 * the tier-driven `homeCap` from `getFanCap(tier)`. Callers fetch
 * these from the DB once per match, then call this function.
 *
 * Returns 0 if any required input is missing — matches without a
 * built stadium or without any fan rows never get an attendance
 * value pushed (the caller maps that to "leave the column null, FE
 * doesn't render the tile").
 */
export function calculateMatchAttendance(
  homeFans: number,
  awayFans: number,
  homeMorale: number,
  awayMorale: number,
  capacity: number,
  tier: number,
): number {
  if (
    !Number.isFinite(homeFans) ||
    !Number.isFinite(awayFans) ||
    !Number.isFinite(capacity) ||
    capacity <= 0
  ) {
    return 0;
  }

  // Home conversion rate: small-club core fans (low ratio) show up at
  // ~50%, large saturated fan bases drop to the original 20% floor.
  // `ratio` is clamped to [0, 1] to defend against fan-base overshoot
  // (e.g. a tier-down reward inflating totalFans past the cap).
  const homeCap = getFanCap(tier);
  const ratio = Math.min(Math.max(homeFans / homeCap, 0), 1);
  const homeConv = 0.5 - 0.3 * ratio;

  const homeRate = 0.6 + (homeMorale / 100) * 0.4;
  const homeFansAttendance = Math.floor(homeFans * homeConv * homeRate);

  // Away conversion rate is fixed at 0.08 — travelling fans don't get
  // the small-club bonus (a different match-day commitment).
  const awayRate = 0.6 + (awayMorale / 100) * 0.4;
  const awayFansAttendance = Math.floor(awayFans * 0.08 * awayRate);

  // Total fans minus the small +/- 5% per-match fluctuation.
  const totalAttendance = homeFansAttendance + awayFansAttendance;
  const fluctuation = 0.95 + Math.random() * 0.1;
  const finalAttendance = Math.floor(totalAttendance * fluctuation);

  // Clamp at stadium capacity — a sold-out stadium is a sold-out
  // stadium regardless of how many fans wanted to come.
  return Math.min(capacity, finalAttendance);
}
