'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AppIcon } from '@/components/icons/AppIcon';
import { FormChipStrip } from '@/components/match/FormChipStrip';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { KickerLabel } from '@/components/ui/KickerLabel';
import { api, type TeamSummary } from '@/lib/api';

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
    failed?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!teamId) return;

    let cancelled = false;

    api.teams
      .getSummary(teamId)
      .then((data) => {
        if (!cancelled) setResult({ id: teamId, data });
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
      <div className="mx-auto w-full max-w-[720px] pb-8">
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
      <div className="mx-auto w-full max-w-[1000px] pb-8">
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
  const standing = team.standing;
  const accent = team.jerseyColorPrimary || '#00e479';
  const formResults = team.recentMatches
    .slice()
    .reverse()
    .map((match) => match.result);

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-gutter pb-8">
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

          {standing ? (
            <div className="shrink-0 text-right">
              <KickerLabel>{t('rankLabel')}</KickerLabel>
              <div className="font-headline text-2xl font-black leading-none text-primary">
                #{standing.position}
              </div>
              <div className="mt-1 text-kicker text-on-surface-variant">
                {standing.points} {t('pointsShort')}
              </div>
            </div>
          ) : null}
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
                        {team.stadium.name}
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

                <div>
                  <dt className="text-kicker text-on-surface-variant">
                    {t('leaguePosition')}
                  </dt>
                  <dd className="mt-0.5 text-label font-bold tabular-nums text-on-surface">
                    {standing ? (
                      `#${standing.position}`
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

          <GlassPanel>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between">
                <KickerLabel>{t('seasonRecord')}</KickerLabel>
                {standing ? (
                  <span className="text-kicker text-on-surface-variant">
                    {t('seasonLabel')} {standing.season}
                  </span>
                ) : null}
              </div>

              {standing ? (
                <div className="mt-3 grid grid-cols-4 gap-2 text-center sm:grid-cols-7">
                  {[
                    { label: t('win'), value: standing.wins },
                    { label: t('draw'), value: standing.draws },
                    { label: t('loss'), value: standing.losses },
                    { label: t('goalsForShort'), value: standing.goalsFor },
                    {
                      label: t('goalsAgainstShort'),
                      value: standing.goalsAgainst,
                    },
                    {
                      label: t('goalDifferenceShort'),
                      value:
                        standing.goalDifference > 0
                          ? `+${standing.goalDifference}`
                          : standing.goalDifference,
                    },
                    { label: t('pointsShort'), value: standing.points },
                  ].map((cell) => (
                    <div
                      key={cell.label}
                      className="rounded-xl bg-surface-container/60 px-2 py-2.5"
                    >
                      <div className="font-headline text-title font-black tabular-nums text-on-surface">
                        {cell.value}
                      </div>
                      <div className="mt-0.5 text-kicker text-on-surface-variant">
                        {cell.label}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-label text-on-surface-variant">
                  {t('noStanding')}
                </p>
              )}

              {formResults.length > 0 ? (
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-kicker text-on-surface-variant">
                    {t('recentForm')}
                  </span>
                  <FormChipStrip
                    results={formResults}
                    variant="glyph"
                    size="sm"
                  />
                </div>
              ) : null}
            </div>
          </GlassPanel>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-gutter lg:w-[340px]">
          <GlassPanel>
            <div className="px-5 py-4">
              <KickerLabel>{t('recentMatches')}</KickerLabel>

              {team.recentMatches.length === 0 ? (
                <p className="mt-3 text-label text-on-surface-variant">
                  {t('noMatches')}
                </p>
              ) : (
                <ul className="mt-2 flex flex-col divide-y divide-outline-variant/20">
                  {team.recentMatches.map((match) => (
                    <li key={match.id}>
                      <Link
                        href={`/${locale}/matches/${match.id}`}
                        className="flex items-center gap-2.5 py-2 transition hover:bg-white/[0.03]"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] font-label text-[10px] font-black ${
                            match.result === 'W'
                              ? 'bg-primary text-on-primary'
                              : match.result === 'L'
                                ? 'bg-error/85 text-white'
                                : 'bg-white/10 text-on-surface-variant'
                          }`}
                        >
                          {match.result}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-label text-on-surface">
                          {match.isHome ? t('home') : t('away')}{' '}
                          {match.opponentName}
                        </span>
                        <span className="shrink-0 font-headline text-label font-black tabular-nums text-on-surface">
                          {match.goalsFor} - {match.goalsAgainst}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </div>
  );
}
