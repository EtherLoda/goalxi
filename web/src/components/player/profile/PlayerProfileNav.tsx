'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * The profile's right column: each block is a link to its own page rather than
 * a tab, so the browser back button returns to the profile and the panel has no
 * hidden state the URL does not describe.
 */
export function PlayerProfileNav({ playerId, locale }: { playerId: number; locale: string }) {
  const t = useTranslations('player_profile');

  const items = [
    {
      href: `/${locale}/players/${playerId}/events`,
      label: t('nav.events'),
      hint: t('nav.eventsHint'),
    },
    {
      href: `/${locale}/players/${playerId}/matches`,
      label: t('nav.matches'),
      hint: t('nav.matchesHint'),
    },
  ];

  return (
    <div className="flex flex-col gap-panel">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="glass-panel group flex items-center justify-between rounded-2xl p-panel transition-colors duration-quick hover:border-primary/40"
        >
          <span className="flex min-w-0 flex-col gap-micro">
            <span className="font-headline text-title font-bold text-on-surface">{item.label}</span>
            <span className="text-label text-on-surface-variant">{item.hint}</span>
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 font-headline text-2xl leading-none text-outline transition-colors duration-quick group-hover:text-primary"
          >
            ›
          </span>
        </Link>
      ))}
    </div>
  );
}
