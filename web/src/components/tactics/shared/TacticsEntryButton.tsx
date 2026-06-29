'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { clsx } from 'clsx';
import { formatLockCountdown, getMatchLockInfo } from '@/lib/match-lock';

interface TacticsEntryButtonProps {
  matchId: string;
  matchStatus: string;
  scheduledAt: string;
  /** Render as a small "icon-only" button (for list rows) or full CTA. */
  variant?: 'icon' | 'full';
  /** Locale for the link href. */
  locale: string;
  className?: string;
  /** Live tick — pass `Date.now()` from a parent interval to auto-refresh. */
  now?: number;
}

/**
 * The "Set Tactics" entry button for scheduled matches.
 *
 * - `canSet` (status=scheduled, >30 min away): solid primary pill with neon glow
 * - Locked (within 30 min or already started): amber pill with pulse dot + lock
 * - Finished: returns null (no entry shown)
 */
export function TacticsEntryButton({
  matchId,
  matchStatus,
  scheduledAt,
  variant = 'icon',
  locale,
  className = '',
  now,
}: TacticsEntryButtonProps) {
  const t = useTranslations('tactics.entry');
  // Lazy initializer: Date.now() only runs once on mount, so the function
  // stays pure across re-renders. Production callers always pass `now` from
  // a parent interval tick; the default only matters for tests / SSR.
  const [fallbackNow] = useState(() => Date.now());
  const effectiveNow = now ?? fallbackNow;
  const info = getMatchLockInfo(matchStatus, scheduledAt, effectiveNow);
  const href = `/${locale}/matches/${matchId}/tactics`;

  if (info.isFinished) return null;

  // -- Locked (within 30 min or already started) -----------------------
  if (!info.canSet) {
    const title = info.hasStarted
      ? t('locked')
      : t('locksIn', { time: formatLockCountdown(info.secondsUntilLock) ?? '0s' });

    if (variant === 'icon') {
      return (
        <span
          className={clsx(
            'inline-flex items-center justify-center w-9 h-9 rounded-full',
            'bg-tertiary/10 border border-tertiary/30 text-tertiary',
            'shadow-[0_0_12px_rgba(233,195,73,0.18)]',
            'cursor-not-allowed',
            className,
          )}
          title={title}
          aria-label={title}
          data-testid="tactics-entry-locked"
        >
          <span className="relative inline-flex">
            <span className="material-symbols-outlined text-base">lock</span>
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
          </span>
        </span>
      );
    }
    return (
      <span
        className={clsx(
          'inline-flex items-center gap-2 px-4 h-10 rounded-full',
          'bg-tertiary/10 border border-tertiary/30 text-tertiary',
          'shadow-[0_0_12px_rgba(233,195,73,0.18)]',
          'cursor-not-allowed font-headline text-xs font-black uppercase tracking-wider',
          className,
        )}
        title={title}
        data-testid="tactics-entry-locked"
      >
        <span className="relative inline-flex">
          <span className="material-symbols-outlined text-base">lock</span>
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
        </span>
        <span>{title}</span>
      </span>
    );
  }

  // -- Active ----------------------------------------------------------
  if (variant === 'icon') {
    return (
      <Link
        href={href}
        className={clsx(
          'group inline-flex items-center justify-center w-9 h-9 rounded-full',
          'bg-primary text-on-primary',
          'shadow-[0_0_18px_rgba(0,228,121,0.45)] hover:shadow-[0_0_24px_rgba(0,228,121,0.7)]',
          'hover:scale-105 active:scale-95 transition-all',
          className,
        )}
        title={t('setTactics')}
        aria-label={t('setTactics')}
        data-testid="tactics-entry"
      >
        <span className="material-symbols-outlined text-base">tune</span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={clsx(
        'group inline-flex items-center gap-2 px-5 h-10 rounded-full',
        'bg-primary text-on-primary',
        'shadow-[0_0_18px_rgba(0,228,121,0.45)] hover:shadow-[0_0_28px_rgba(0,228,121,0.75)]',
        'hover:scale-[1.02] active:scale-[0.98] transition-all',
        'font-headline text-xs font-black uppercase tracking-wider',
        className,
      )}
      data-testid="tactics-entry"
    >
      <span className="material-symbols-outlined text-base">tune</span>
      <span>{t('setTactics')}</span>
      <span className="material-symbols-outlined text-base opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all">
        arrow_forward
      </span>
    </Link>
  );
}