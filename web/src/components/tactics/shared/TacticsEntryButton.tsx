'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
 * The "Set Tactics" entry icon/button for scheduled matches.
 *
 * - `canSet` (status=scheduled, >30 min away): active link → /[locale]/matches/[id]/tactics
 * - Locked (within 30 min or already started): disabled, lock icon, countdown
 * - Finished: returns null (no entry shown)
 */
export function TacticsEntryButton({
  matchId,
  matchStatus,
  scheduledAt,
  variant = 'icon',
  locale,
  className = '',
  now = Date.now(),
}: TacticsEntryButtonProps) {
  const t = useTranslations('tactics.entry');
  const info = getMatchLockInfo(matchStatus, scheduledAt, now);
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
          className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-outline cursor-not-allowed ${className}`}
          title={title}
          aria-label={title}
          data-testid="tactics-entry-locked"
        >
          <span className="material-symbols-outlined text-base">lock</span>
        </span>
      );
    }
    return (
      <span
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-container-highest border border-outline-variant/20 text-outline cursor-not-allowed ${className}`}
        title={title}
        data-testid="tactics-entry-locked"
      >
        <span className="material-symbols-outlined text-base">lock</span>
        <span className="font-label text-[10px] tracking-widest uppercase">{title}</span>
      </span>
    );
  }

  // -- Active ----------------------------------------------------------
  if (variant === 'icon') {
    return (
      <Link
        href={href}
        className={`inline-flex items-center justify-center w-8 h-8 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors ${className}`}
        title={t('setTactics')}
        aria-label={t('setTactics')}
        data-testid="tactics-entry"
      >
        <span className="material-symbols-outlined text-base">strategy</span>
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25 transition-colors font-label text-[10px] tracking-widest uppercase ${className}`}
      data-testid="tactics-entry"
    >
      <span className="material-symbols-outlined text-base">strategy</span>
      {t('setTactics')}
    </Link>
  );
}
