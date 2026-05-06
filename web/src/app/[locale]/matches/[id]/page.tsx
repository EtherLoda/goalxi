'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api, type Match, type MatchEvent, type MatchStatsRes } from '@/lib/api';
import { TacticalMatchDetail } from '@/components/match/TacticalMatchDetail';

interface MatchPageData {
  match: Match;
  events: MatchEvent[];
  stats: MatchStatsRes;
}

function MatchDetailContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';
  const matchId = params.id as string;

  const [data, setData] = useState<MatchPageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!matchId) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [match, eventsData, stats] = await Promise.all([
          api.matches.getById(matchId),
          api.matches.getEvents(matchId),
          api.matches.getStats(matchId),
        ]);
        setData({ match, events: eventsData.events, stats });
      } catch (err) {
        console.error('Failed to fetch match data:', err);
        setError('Failed to load match data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [matchId]);

  if (isLoading) {
    return <MatchDetailLoading />;
  }

  if (error || !data) {
    return (
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-surface-container-low rounded-2xl p-12 text-center border border-error/20">
          <span className="material-symbols-outlined text-6xl text-error/50 mb-4 block">
            error
          </span>
          <p className="text-on-surface-variant text-lg font-medium mb-2">{error || 'Match not found'}</p>
          <Link
            href={`/${locale}/matches`}
            className="inline-flex items-center gap-2 text-primary hover:underline mt-4"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Matches
          </Link>
        </div>
      </div>
    );
  }

  const { match, events, stats } = data;

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      {/* Page Header */}
      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/matches`}
            className="flex items-center justify-center w-10 h-10 bg-surface-container-low border border-outline-variant/30 text-on-surface-variant rounded-DEFAULT hover:bg-surface-container-high hover:text-on-surface transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          </Link>
          <div>
            <h1 className="font-headline text-2xl md:text-3xl font-black tracking-tight text-on-surface uppercase italic">
              Match Report
            </h1>
            <p className="text-sm text-on-surface-variant font-headline">
              {match.leagueId ? `Round ${match.round || '?'} • Season ${match.season}` : ''}
            </p>
          </div>
        </div>

        {/* Live badge if somehow accessed during live */}
        {match.status === 'in_progress' && (
          <Link
            href={`/${locale}/matches/live/${match.id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-DEFAULT text-sm font-medium hover:bg-primary/20 transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            Enter Live Match
          </Link>
        )}
      </header>

      {/* Main Content: 8:4 Ratio Grid */}
      <TacticalMatchDetail
        match={{
          homeScore: match.homeScore,
          awayScore: match.awayScore,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          status: match.status,
          scheduledAt: match.scheduledAt,
        }}
        events={events}
        stats={stats}
      />
    </div>
  );
}

function MatchDetailLoading() {
  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-10 h-10 bg-surface-container-low rounded-DEFAULT animate-pulse" />
        <div className="space-y-2">
          <div className="h-8 w-48 bg-surface-container-low rounded animate-pulse" />
          <div className="h-4 w-32 bg-surface-container-low rounded animate-pulse" />
        </div>
      </div>
      <div className="h-[600px] bg-surface-container-low rounded-2xl animate-pulse" />
    </div>
  );
}

export default function MatchDetailPage() {
  return (
    <Suspense fallback={<MatchDetailLoading />}>
      <MatchDetailContent />
    </Suspense>
  );
}
