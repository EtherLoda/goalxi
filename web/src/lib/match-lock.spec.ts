/**
 * match-lock.spec.ts — unit tests for the shared 30-min lock logic.
 */
import { getMatchLockInfo, formatLockCountdown } from './match-lock';

describe('getMatchLockInfo', () => {
  it('canSet=true when scheduled > 30 min away', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('scheduled', future);
    expect(info.canSet).toBe(true);
    expect(info.isLocked).toBe(false);
    expect(info.hasStarted).toBe(false);
    expect(info.isFinished).toBe(false);
  });

  it('canSet=false when scheduled within 30 min of kickoff', () => {
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('scheduled', future);
    expect(info.canSet).toBe(false);
    expect(info.isLocked).toBe(true);
  });

  it('canSet=true when scheduled just past 30-min lock boundary', () => {
    // scheduledAt is 30 min + 5s in the future, so we're still 5s before the lock
    const future = new Date(Date.now() + 30 * 60 * 1000 + 5000).toISOString();
    const info = getMatchLockInfo('scheduled', future);
    expect(info.canSet).toBe(true);
    expect(info.isLocked).toBe(false);
  });

  it('isLocked when status is in_progress regardless of time', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('in_progress', future);
    expect(info.canSet).toBe(false);
    expect(info.isLocked).toBe(true);
    expect(info.hasStarted).toBe(true);
    expect(info.isFinished).toBe(false);
  });

  it('isFinished when status is completed', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('completed', past);
    expect(info.isFinished).toBe(true);
    expect(info.hasStarted).toBe(true);
    expect(info.isLocked).toBe(true);
    expect(info.canSet).toBe(false);
  });

  it('isFinished when status is cancelled', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('cancelled', future);
    expect(info.isFinished).toBe(true);
  });

  it('computes secondsUntilLock and secondsUntilKickoff correctly', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
    const info = getMatchLockInfo('scheduled', future);
    // Kickoff in 3600s; lock in 3600 - 1800 = 1800s
    expect(info.secondsUntilKickoff).toBeGreaterThan(3590);
    expect(info.secondsUntilKickoff).toBeLessThan(3610);
    expect(info.secondsUntilLock).toBeGreaterThan(1790);
    expect(info.secondsUntilLock).toBeLessThan(1810);
  });

  it('isLocked when scheduled in the past', () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const info = getMatchLockInfo('scheduled', past);
    expect(info.canSet).toBe(false);
    expect(info.isLocked).toBe(true);
  });

  it('isLocked when status is tactics_locked', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const info = getMatchLockInfo('tactics_locked', future);
    expect(info.isLocked).toBe(true);
    expect(info.canSet).toBe(false);
  });
});

describe('formatLockCountdown', () => {
  it('returns null for non-positive values', () => {
    expect(formatLockCountdown(0)).toBeNull();
    expect(formatLockCountdown(-5)).toBeNull();
  });

  it('formats hours and minutes', () => {
    expect(formatLockCountdown(3600 + 20 * 60)).toBe('1h 20m');
  });

  it('formats minutes only', () => {
    expect(formatLockCountdown(5 * 60)).toBe('5m');
  });

  it('formats seconds when < 1 min', () => {
    expect(formatLockCountdown(45)).toBe('45s');
  });
});
