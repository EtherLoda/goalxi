/**
 * match-lock.ts — shared 30-minute lock state for the tactics entry button.
 *
 * Reused by:
 *  - matches list page (each upcoming fixture)
 *  - match detail page (header CTA)
 *  - any future "tactics-required" badge
 *
 * Mirrors the backend `MATCH_TACTICS_DEADLINE_MINUTES` constant.
 */

import { LOCK_THRESHOLD_MINUTES, type MatchStatus } from '@/components/tactics/types';

export interface MatchLockInfo {
  /** True if match is still scheduled AND > 30 min from kickoff. */
  canSet: boolean;
  /** True if match is within the 30-min lock window OR already started. */
  isLocked: boolean;
  /** Seconds until the 30-min lock window opens. Negative = already locked. */
  secondsUntilLock: number;
  /** Seconds until kickoff. Negative = already kicked off. */
  secondsUntilKickoff: number;
  /** True if match has already started. */
  hasStarted: boolean;
  /** True if match is completed or cancelled. */
  isFinished: boolean;
}

export function getMatchLockInfo(
  matchStatus: MatchStatus | string,
  scheduledAtIso: string,
  nowMs: number = Date.now(),
): MatchLockInfo {
  const scheduledMs = new Date(scheduledAtIso).getTime();
  const lockMs = scheduledMs - LOCK_THRESHOLD_MINUTES * 60 * 1000;
  const secondsUntilKickoff = Math.floor((scheduledMs - nowMs) / 1000);
  const secondsUntilLock = Math.floor((lockMs - nowMs) / 1000);

  const isFinished = matchStatus === 'completed' || matchStatus === 'cancelled';
  const hasStarted = matchStatus === 'in_progress' || isFinished;
  const isLocked = hasStarted || nowMs >= lockMs || matchStatus !== 'scheduled';
  const canSet = matchStatus === 'scheduled' && nowMs < lockMs;

  return {
    canSet,
    isLocked,
    secondsUntilLock,
    secondsUntilKickoff,
    hasStarted,
    isFinished,
  };
}

/**
 * Short countdown string (e.g. "5m" or "1h 20m") for a duration in seconds.
 * Returns null for negative durations.
 */
export function formatLockCountdown(seconds: number): string | null {
  if (seconds <= 0) return null;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${secs}s`;
}
