'use client';

import React, { useEffect, useRef } from 'react';
import { LOCK_WARNING_MINUTES } from '../types';

interface LockCountdownProps {
  countdownSeconds: number;
  isLocked: boolean;
  isWarning: boolean;
  matchStatus: 'scheduled' | 'tactics_locked' | 'in_progress' | 'completed' | 'cancelled';
  className?: string;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Renders a tactical-style countdown. Uses direct DOM textContent updates
 * after the first render to avoid re-rendering the parent on every tick.
 */
export function LockCountdown({
  countdownSeconds,
  isLocked,
  isWarning,
  matchStatus,
  className = '',
}: LockCountdownProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (ref.current && !firstRender.current) {
      ref.current.textContent = formatCountdown(countdownSeconds);
    }
    firstRender.current = false;
  }, [countdownSeconds]);

  const bg = isLocked
    ? 'bg-error/10 border-error/30 text-error'
    : isWarning
      ? 'bg-tertiary/10 border-tertiary/30 text-tertiary'
      : 'bg-primary/10 border-primary/30 text-primary';

  const label = isLocked
    ? matchStatus === 'in_progress' || matchStatus === 'completed'
      ? matchStatus.replace('_', ' ')
      : 'Locked'
    : isWarning
      ? 'Warning'
      : 'Tactical Lock';

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${bg} ${className}`}>
      <span className="material-symbols-outlined text-base">
        {isLocked ? 'lock' : isWarning ? 'timer' : 'schedule'}
      </span>
      <div className="flex flex-col">
        <span className="font-label text-[9px] tracking-[0.2em] uppercase opacity-70">{label}</span>
        <span ref={ref} className="font-headline font-bold text-sm tracking-tight">
          {formatCountdown(countdownSeconds)}
        </span>
      </div>
    </div>
  );
}

export function isLockWarning(countdownSeconds: number, isLocked: boolean): boolean {
  return !isLocked && countdownSeconds <= LOCK_WARNING_MINUTES * 60;
}
