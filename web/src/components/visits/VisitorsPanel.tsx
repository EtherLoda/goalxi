'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { KickerLabel } from '@/components/ui/KickerLabel';
import type { VisitList } from '@/lib/api';

interface VisitorsPanelProps {
  visits: VisitList | null;
}

/**
 * "Who stopped by" — the club page's only live block.
 *
 * Deliberately read-only and small: no avatars grid, no paging, no
 * counters beyond today's. The data disappears after three days by
 * design, so this is a pulse, not a history.
 */
export function VisitorsPanel({ visits }: VisitorsPanelProps) {
  const t = useTranslations('team_profile');
  const locale = useLocale();

  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between gap-tight">
        <KickerLabel>{t('visitors')}</KickerLabel>
        {visits && visits.todayCount > 0 ? (
          <span className="text-kicker tabular-nums text-on-surface-variant">
            {t('visitorsToday', { count: visits.todayCount })}
          </span>
        ) : null}
      </div>

      {visits && visits.visitors.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1.5">
          {visits.visitors.map((visitor) => (
            <li key={visitor.userId}>
              <Link
                href={`/${locale}/managers/${visitor.userId}`}
                className="flex items-center gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.04]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-container-high text-kicker font-black text-on-surface-variant">
                  {visitor.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={visitor.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    visitor.displayName.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-label text-on-surface">
                  {visitor.displayName}
                </span>
                <span className="shrink-0 text-kicker text-on-surface-variant">
                  {timeAgo(visitor.lastVisitAt, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-label text-on-surface-variant/70">
          <AppIcon name="visibility" className="text-base text-outline" />
          {t('visitorsNone')}
        </p>
      )}
    </div>
  );
}

/**
 * "3 分钟前" without a locale-dependent library.
 *
 * Next would hydrate a different string on the client if this ran during
 * SSR, so the caller only mounts it with client-fetched data.
 */
function timeAgo(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}
