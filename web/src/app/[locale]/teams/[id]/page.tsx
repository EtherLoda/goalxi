'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { api, type TeamSummary, type VisitList } from '@/lib/api';
import { VisitTracker } from '@/components/visits/VisitTracker';
import { VisitorsPanel } from '@/components/visits/VisitorsPanel';

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

/**
 * Public club page — read-only by design (plan §4.1).
 *
 * It answers "who is this club and how are they doing", and nothing
 * else: no squad table, no fixture list, no actions. Those already live
 * on the dashboard and the league page, and duplicating them here is how
 * this page turned into a second dashboard the last time it was built.
 */
export default function TeamPublicPage({ params }: PageProps) {
  const resolved = use(params);
  const locale = resolved.locale;
  const teamId = resolved.id;
  const t = useTranslations('team_profile');

  const [result, setResult] = useState<{
    id: string;
    data?: TeamSummary;
    visits?: VisitList | null;
    failed?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    Promise.all([
      api.teams.getSummary(teamId),
      // Visitors are decoration: a Redis outage must not blank the page.
      api.visits.list(`team`, teamId).catch(() => null),
    ])
      .then(([data, visits]) => {
        if (!cancelled) setResult({ id: teamId, data, visits });
      })
      .catch(() => {
        if (!cancelled) setResult({ id: teamId, failed: true });
      });

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const settled = result && result.id === teamId ? result : null;

  if (settled?.failed) {
    return (
      <div className="mx-auto w-full max-w-[720px] p-4 md:p-6">
        <GlassPanel>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <AppIcon name="shield" className="text-4xl text-outline" />
            <p className="font-headline text-title font-black text-on-surface">
              {t('notFound')}
            </p>
            <p className="max-w-[36ch] text-label text-on-surface-variant">
              {t('notFoundHint')}
            </p>
          </div>
        </GlassPanel>
      </div>
    );
  }

  if (!settled?.data) {
    return (
      <div className="mx-auto w-full max-w-[1000px] p-4 md:p-6">
        <GlassPanel>
          <div className="flex animate-pulse items-center gap-5 px-5 py-5">
            <div className="h-20 w-20 rounded-2xl bg-white/[0.05]" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-44 rounded bg-white/[0.05]" />
              <div className="h-4 w-60 rounded bg-white/[0.04]" />
            </div>
          </div>
        </GlassPanel>
      </div>
    );
  }

  const team = settled.data;
  const visits = settled.visits ?? null;
  const accent = team.jerseyColorPrimary || '#00e479';

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-gutter p-4 md:p-6">
      <GlassPanel>
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl font-headline text-2xl font-black text-on-surface"
            style={{
              background: `linear-gradient(135deg, ${accent}26, ${accent}0a)`,
            }}
            aria-hidden
          >
            {team.name.slice(0, 2).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-headline text-2xl font-black tracking-tight text-on-surface">
                {team.name}
              </h1>
              <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-label text-kicker font-bold tabular-nums text-outline">
                {team.shortCode}
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-on-surface-variant">
              {team.league ? (
                <Link
                  href={`/${locale}/league/${team.league.id}`}
                  className="font-bold text-primary hover:underline"
                >
                  {team.league.name}
                </Link>
              ) : (
                <span>{t('noLeague')}</span>
              )}
              {team.city ? <span>· {team.city}</span> : null}
              {team.foundedYear ? (
                <span>
                  · {t('founded')} {team.foundedYear}
                </span>
              ) : null}
            </div>
          </div>

        </div>
      </GlassPanel>

      <div className="flex flex-col gap-gutter lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-gutter">
          <GlassPanel>
            <div className="px-5 py-4">
              <KickerLabel>{t('profile')}</KickerLabel>

              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-kicker text-on-surface-variant">
                    {t('manager')}
                  </dt>
                  <dd className="mt-0.5 text-label font-bold text-on-surface">
                    {team.manager ? (
                      <Link
                        href={`/${locale}/managers/${team.manager.id}`}
                        className="text-primary hover:underline"
                      >
                        {team.manager.name ?? t('unknownManager')}
                      </Link>
                    ) : (
                      <span className="font-normal text-on-surface-variant">
                        {t('noManager')}
                      </span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-kicker text-on-surface-variant">
                    {t('stadium')}
                  </dt>
                  <dd className="mt-0.5 text-label font-bold text-on-surface">
                    {team.stadium ? (
                      <>
                        <Link
                          href={`/${locale}/club/stadium?team=${team.id}`}
                          className="text-primary hover:underline"
                        >
                          {team.stadium.name}
                        </Link>
                        <span className="ml-1.5 font-normal tabular-nums text-on-surface-variant">
                          {team.stadium.capacity.toLocaleString('en-US')}
                        </span>
                      </>
                    ) : (
                      <span className="font-normal text-on-surface-variant">
                        —
                      </span>
                    )}
                  </dd>
                </div>

                <div>
                  <dt className="text-kicker text-on-surface-variant">
                    {t('fans')}
                  </dt>
                  <dd className="mt-0.5 text-label font-bold tabular-nums text-on-surface">
                    {team.fans ? (
                      team.fans.totalFans.toLocaleString('en-US')
                    ) : (
                      <span className="font-normal text-on-surface-variant">
                        —
                      </span>
                    )}
                  </dd>
                </div>

              </dl>
            </div>
          </GlassPanel>

        </div>

        <aside className="flex w-full flex-col gap-gutter lg:w-[300px]">
          <GlassPanel>
            <VisitorsPanel visits={visits} />
          </GlassPanel>
        </aside>
      </div>

      <VisitTracker subjectType="team" subjectId={teamId} />
    </div>
  );
}
