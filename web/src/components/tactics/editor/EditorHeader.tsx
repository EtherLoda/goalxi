'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React from 'react';
import { useTranslations } from 'next-intl';
import { LockCountdown, isLockWarning } from '../shared/LockCountdown';
import type { LockState } from '../types';

interface EditorHeaderProps {
  formation: string;
  /** "窄 · 防线低 · 双翼齐飞" — the rest of the shape, already localised. */
  summary: string;
  isDirty: boolean;
  lock: LockState;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  /**
   * Mobile renders the primary action in the sticky footer instead, so the
   * header drops its copy rather than showing two submit buttons.
   */
  showSubmit?: boolean;
  /** The desktop tab bar. Rendered between the summary and the actions so
   *  navigation sits on the same line as the state it switches between. */
  center?: React.ReactNode;
  /** Preset drawer trigger, kept beside the other header actions. */
  presetSlot?: React.ReactNode;
}

/**
 * The header used to hold five competing focal points — a second "战术"
 * title, a 2xl formation badge, an unsaved chip, a countdown and the submit
 * button — so nothing read as the primary action.
 *
 * What changed (V09 / V12):
 *  - the page owns the only <h1>; this header carries no title at all;
 *  - the formation is demoted to a small tabular-nums chip inside the
 *    summary line, because it is reference information, not a call to act;
 *  - the countdown keeps its own emphasis behaviour from `LockCountdown`,
 *    which is the one element that genuinely has to win the eye when the
 *    deadline is close.
 */
export function EditorHeader({
  formation,
  summary,
  isDirty,
  lock,
  isSubmitting,
  canSubmit,
  onSubmit,
  showSubmit = true,
  center,
  presetSlot,
}: EditorHeaderProps) {
  const t = useTranslations('tactics');
  const tLock = useTranslations('tactics.lock');
  const isWarning = isLockWarning(lock.countdownSeconds, lock.isLocked);

  let statusMessage: string | null;
  if (lock.isLocked) {
    if (lock.matchStatus === 'in_progress') statusMessage = tLock('inProgress');
    else if (lock.matchStatus === 'completed') statusMessage = tLock('completed');
    else if (lock.countdownSeconds > 0) statusMessage = tLock('lockedDesc', { time: formatTime(lock.countdownSeconds) });
    else statusMessage = tLock('locked');
  } else if (isWarning) {
    statusMessage = tLock('warningDesc', { time: formatTime(lock.countdownSeconds) });
  } else {
    statusMessage = null;
  }

  return (
    <header className="glass-panel flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <AppIcon name="strategy" className="text-primary text-2xl shrink-0" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-headline font-bold text-sm text-on-surface">
            <span className="rounded bg-primary/12 px-1.5 py-0.5 font-label text-[11px] font-bold tabular-nums tracking-[0.08em] text-primary">
              {formation}
            </span>
            <span className="truncate text-on-surface-variant">{summary}</span>
          </p>
          {statusMessage ? (
            <p className="font-label text-[10px] tracking-widest uppercase text-outline">
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      {/* Navigation sits in the middle of the bar: the tabs switch WHICH
          state you are editing, so they belong next to the state summary
          rather than on a row of their own above the work. */}
      {center ? <div className="flex flex-1 justify-center">{center}</div> : <div className="flex-1" />}

      <div className="flex shrink-0 items-center gap-3">
        {presetSlot}
        {isDirty && (
          <span className="flex h-11 items-center gap-1.5 rounded-lg border border-tertiary/30 bg-tertiary/15 px-2.5 font-label text-[10px] tracking-widest uppercase text-tertiary">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            {tLock('unsaved')}
          </span>
        )}
        <LockCountdown
          countdownSeconds={lock.countdownSeconds}
          isLocked={lock.isLocked}
          isWarning={isWarning}
          matchStatus={lock.matchStatus}
          className="h-11"
        />
        {showSubmit && (
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 font-headline font-bold text-sm tracking-tight text-on-primary uppercase shadow-[0_0_15px_rgba(0,228,121,0.3)] transition-colors duration-quick hover:bg-primary-dim disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            data-testid="submit-tactics"
          >
            <AppIcon name="save" className="text-base" />
            {isSubmitting ? t('submitting') : t('submit')}
          </button>
        )}
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
