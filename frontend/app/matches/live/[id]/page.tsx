'use client';

import React, { Suspense, useState } from 'react';
import { api } from '@/lib/api';
import { MatchHeader } from '@/components/match/MatchHeader';
import { LiveMatchViewer } from '@/components/match/LiveMatchViewer';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import Link from 'next/link';
import { use } from 'react';

function MatchData({ id }: { id: string }) {
    const [match, setMatch] = useState<any>(null);
    const [eventsData, setEventsData] = useState<any>(null);
    const [stats, setStats] = useState<any>(null);
    const [currentScore, setCurrentScore] = useState<{ home: number; away: number }>({ home: 0, away: 0 });
    const [loading, setLoading] = useState(true);

    React.useEffect(() => {
        async function fetchData() {
            try {
                const matchData = await api.getMatch(id);
                setMatch(matchData);

                // Try to get events data
                let events: any = null;
                try {
                    events = await api.getMatchEvents(id);
                } catch (e) {
                    // Events don't exist yet
                    events = {
                        matchId: id,
                        currentMinute: 0,
                        totalMinutes: 90,
                        isComplete: false,
                        events: [],
                        currentScore: { home: 0, away: 0 },
                        stats: null
                    };
                }

                // Ensure currentScore exists
                if (!events.currentScore) {
                    events.currentScore = { home: 0, away: 0 };
                }

                setEventsData(events);
                setCurrentScore(events.currentScore);

                // Try to get stats
                try {
                    const matchStats = await api.getMatchStats(id);
                    setStats(matchStats);
                } catch (e) {
                    // Stats not available
                }
            } catch (error) {
                console.error('Error fetching match data:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [id]);

    const handleScoreUpdate = (score: { home: number; away: number }) => {
        setCurrentScore(score);
    };

    if (loading || !match || !eventsData) {
        return <MatchLoadingSkeleton />;
    }

    return (
        <div className="min-h-screen font-mono">
            {/* Background is handled globally by layout.tsx */}

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
                {/* Back Button */}
                <div className="mb-6">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300 transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span>
                        <span className="font-bold tracking-wider">BACK TO HOME</span>
                    </Link>
                </div>

                {/* Match Header */}
                <div className="mb-8">
                    <MatchHeader 
                        match={match} 
                        currentScore={match.status === 'in_progress' || match.status === 'completed' ? currentScore : undefined}
                        currentMinute={eventsData?.currentMinute}
                    />
                </div>

                {/* Live Match Viewer with Simulation Control */}
                <LiveMatchViewer
                    matchId={id}
                    homeTeamId={match.homeTeamId}
                    awayTeamId={match.awayTeamId}
                    homeTeamName={match.homeTeam?.name || 'Home Team'}
                    awayTeamName={match.awayTeam?.name || 'Away Team'}
                    initialEventsData={eventsData}
                    initialStats={stats}
                    matchStatus={match.status}
                    onScoreUpdate={handleScoreUpdate}
                />
            </div>
        </div>
    );
}

function MatchLoadingSkeleton() {
    return (
        <div className="min-h-screen bg-black font-mono">
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>
                <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] animate-pulse"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8 max-w-7xl">
                <div className="mb-6">
                    <Skeleton className="h-4 w-32" />
                </div>

                {/* Match Header Skeleton */}
                <div className="mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-8">
                    <div className="flex items-center justify-between gap-8">
                        <div className="flex-1 space-y-3">
                            <Skeleton className="h-8 w-48" />
                            <Skeleton className="h-6 w-32" />
                        </div>
                        <Skeleton className="h-24 w-24 rounded-2xl" />
                        <div className="flex-1 space-y-3 text-right">
                            <Skeleton className="h-8 w-48 ml-auto" />
                            <Skeleton className="h-6 w-32 ml-auto" />
                        </div>
                    </div>
                </div>

                {/* Content Grid Skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 rounded-xl" />
                        ))}
                    </div>
                    <div className="space-y-4">
                        <Skeleton className="h-64 rounded-xl" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);

    return <MatchData id={id} />;
}
