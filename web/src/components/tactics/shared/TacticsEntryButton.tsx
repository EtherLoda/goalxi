'use client';

import { AppIcon } from "@/components/icons/AppIcon";
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
  variant?: 'icon' | 'full' | 'compact';
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

  // -- Compact: a bare glyph that rides alongside a club name -----------
  // No background, no fixed box. It sits INSIDE the name cell, so anything
  // with a footprint would either push the name into truncation or overlap
  // it. A 16px glyph with a colour glow is still unambiguous, and the
  // title/aria-label carry the full sentence.
  if (variant === 'compact') {
    const label = info.canSet
      ? t('setTactics')
      : info.hasStarted
        ? t('locked')
        : t('locksIn', {
            time: formatLockCountdown(info.secondsUntilLock) ?? '0s',
          });

    if (!info.canSet) {
      return (
        <span
          className={clsx(
            'inline-flex shrink-0 items-center justify-center text-tertiary/70',
            className,
          )}
          title={label}
          aria-label={label}
          data-testid="tactics-entry-locked"
        >
          <AppIcon name="lock" className="text-[13px]" />
        </span>
      );
    }

    return (
      <Link
        href={href}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center text-primary',
          'drop-shadow-[0_0_6px_rgba(0,228,121,0.65)]',
          'transition-[filter] hover:brightness-125',
          className,
        )}
        title={label}
        aria-label={label}
        data-testid="tactics-entry"
      >
        <AppIcon name="tune" className="text-[15px]" />
      </Link>
    );
  }

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
            <AppIcon name="lock" className="text-base" />
            {/* V10: this used to be `animate-pulse` — an infinite blink, the
                strongest attention signal the design system has, on a state
                that lasts until kickoff. A locked button is not an event; it
                is a fact. Static dot, colour carries the meaning. */}
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-tertiary" />
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
          <AppIcon name="lock" className="text-base" />
          <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-tertiary" />
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
          'hover:scale-105 active:scale-95 transition-[transform,box-shadow] duration-quick',
          className,
        )}
        title={t('setTactics')}
        aria-label={t('setTactics')}
        data-testid="tactics-entry"
      >
        <AppIcon name="tune" className="text-base" />
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
        'hover:scale-[1.02] active:scale-[0.98] transition-[transform,box-shadow] duration-quick',
        'font-headline text-xs font-black uppercase tracking-wider',
        className,
      )}
      data-testid="tactics-entry"
    >
      <AppIcon name="tune" className="text-base" />
      <span>{t('setTactics')}</span>
      <AppIcon name="arrow_forward" className="text-base opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-[opacity,margin] duration-quick" />
    </Link>
  );
}