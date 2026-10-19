'use client';

import { AppIcon } from "@/components/icons/AppIcon";
import React, { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, type Match } from '@/lib/api';
import { TacticsEditor } from '@/components/tactics/editor/TacticsEditor';

function TacticsEditorContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;
  const tCommon = useTranslations('common');

  const [match, setMatch] = useState<Match | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await api.matches.getById(matchId);
        if (cancelled) return;
        setMatch(m);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load match');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  if (isLoading) {
    return <TacticsLoading />;
  }
  if (error || !match) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="glass-panel rounded-2xl p-12 text-center border border-error/20">
          <AppIcon name="error" className="text-6xl text-error/50 mb-4 block" />
          <p className="text-on-surface-variant text-lg font-medium mb-2">{error || 'Match not found'}</p>
          <Link
            href={`/${locale}/matches`}
            className="inline-flex items-center gap-2 text-primary hover:underline mt-4"
          >
            <AppIcon name="arrow_back" className="text-lg" />
            Back
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[1320px] flex-col overflow-hidden p-4 md:p-6 lg:block lg:h-auto lg:overflow-visible">
      <header className="mb-4 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/matches/${matchId}`}
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-lg hover:bg-surface-container-high hover:text-on-surface transition-all"
            aria-label={tCommon('back')}
          >
            <AppIcon name="arrow_back" className="text-[18px]" />
          </Link>
          <div>
            {/* The fixture is the page's one heading. The editor header also
                renders "战术"; making that the h1 too gave the document two
                competing titles. */}
            <h1 className="font-headline text-xl md:text-2xl font-black tracking-tight text-on-surface uppercase italic">
              {match.homeTeam?.name} vs {match.awayTeam?.name}
            </h1>
          </div>
        </div>
      </header>
      {/* Mobile: the editor is an app shell that owns the remaining height, so
          the step bar and the action bar stay put and only the middle scrolls.
          Desktop: everything is in normal document flow and the page scrolls. */}
      <div className="flex min-h-0 flex-1 flex-col lg:block">
        <TacticsEditor matchId={matchId} match={match} />
      </div>
    </div>
  );
}

function TacticsLoading() {
  return (
    <div className="p-4 md:p-6 max-w-[1320px] mx-auto w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-surface-container-low rounded-lg animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-48 bg-surface-container-low rounded animate-pulse" />
          <div className="h-4 w-32 bg-surface-container-low rounded animate-pulse" />
        </div>
      </div>
      <div className="h-[600px] bg-surface-container-low rounded-2xl animate-pulse" />
    </div>
  );
}

function TacticsEditorPage() {
  return (
    <Suspense fallback={<TacticsLoading />}>
      <TacticsEditorContent />
    </Suspense>
  );
}

export default function TacticsEditorPageWrapper() {
  return (
    <Suspense fallback={null}>
      <TacticsEditorPage />
    </Suspense>
  );
}

