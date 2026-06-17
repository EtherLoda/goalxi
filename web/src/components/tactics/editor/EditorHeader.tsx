'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { LockCountdown, isLockWarning } from '../shared/LockCountdown';
import type { LockState } from '../types';

interface EditorHeaderProps {
  formation: string;
  isDirty: boolean;
  lock: LockState;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}

export function EditorHeader({ formation, isDirty, lock, isSubmitting, canSubmit, onSubmit }: EditorHeaderProps) {
  const t = useTranslations('tactics');
  const tLock = useTranslations('tactics.lock');
  const isWarning = isLockWarning(lock.countdownSeconds, lock.isLocked);

  let statusMessage: string;
  if (lock.isLocked) {
    if (lock.matchStatus === 'in_progress') statusMessage = tLock('inProgress');
    else if (lock.matchStatus === 'completed') statusMessage = tLock('completed');
    else if (lock.countdownSeconds > 0) statusMessage = tLock('lockedDesc', { time: formatTime(lock.countdownSeconds) });
    else statusMessage = tLock('locked');
  } else if (isWarning) {
    statusMessage = tLock('warningDesc', { time: formatTime(lock.countdownSeconds) });
  } else {
    statusMessage = t('formationAuto', { formation });
  }

  return (
    <header className="glass-panel rounded-2xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className="material-symbols-outlined text-primary text-2xl">strategy</span>
        <div className="min-w-0">
          <h1 className="font-headline font-black text-xl tracking-tight text-white uppercase">
            {t('title')}
          </h1>
          <p className="font-label text-[10px] tracking-widest uppercase text-outline">
            {statusMessage}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="font-headline font-black text-2xl tracking-tighter text-primary">
          {formation}
        </div>
        {isDirty && (
          <span className="px-2 py-0.5 rounded bg-tertiary/20 text-tertiary border border-tertiary/30 font-label text-[9px] tracking-widest uppercase">
            ● Unsaved
          </span>
        )}
        <LockCountdown
          countdownSeconds={lock.countdownSeconds}
          isLocked={lock.isLocked}
          isWarning={isWarning}
          matchStatus={lock.matchStatus}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || isSubmitting}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-on-primary font-headline font-bold text-sm tracking-tight uppercase shadow-[0_0_15px_rgba(0,228,121,0.3)] hover:bg-primary-dim transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          data-testid="submit-tactics"
        >
          <span className="material-symbols-outlined text-base">save</span>
          {isSubmitting ? t('submitting') : t('submit')}
        </button>
      </div>
    </header>
  );
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return '0s';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
