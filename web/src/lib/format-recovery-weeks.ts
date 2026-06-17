/**
 * Convert a recovery estimate in days to a coarse "N week(s)" bucket for UI display.
 *
 * User contract: 1 day → 1 week, 5 days → 1 week, 13 days → 2 weeks.
 * Anything below 1 day (i.e. the player is already recovered) is treated as 1
 * so a single defensive fallback exists; the caller is expected to not
 * render a badge for fully healed players.
 */
export function formatRecoveryWeeks(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 1;
  return Math.max(1, Math.round(days / 7));
}
