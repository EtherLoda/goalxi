import React, { Suspense } from 'react';
import { api } from '@/lib/api';
import { MatchHeader } from '@/components/match/MatchHeader';
import { MatchEvents } from '@/components/match/MatchEvents';
import { MatchStats } from '@/components/match/MatchStats';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import Link from 'next/link';

async function MatchData({ id }: { id: string }) {
    const match = await api.getMatch(id);
    const eventsData = await api.getMatchEvents(id);

    let stats = null;
    try {
        stats = await api.getMatchStats(id);
    } catch (e) {
        // Ignore error if stats not found
    }

    return (
        <div className="min-h-screen bg-black font-mono">
            {/* Cyber Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#022c22_1px,transparent_1px),linear-gradient(to_bottom,#022c22_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-50"></div>
                <div className="absolute top-[-10%] left-[10%] w-[50%] h-[50%] rounded-full bg-emerald-900/10 blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[10%] w-[40%] h-[40%] rounded-full bg-emerald-900/10 blur-[100px]"></div>
            </div>

            <div className="relative z-10 container mx-auto px-4 py-8">
                {/* Back Button */}
                <div className="mb-6">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors group"
                    >
                        <span className="group-hover:-translate-x-1 transition-transform">←</span>
                        <span className="font-bold tracking-wider">BACK TO HOME</span>
                    </Link>
                </div>

                {/* Match Header */}
                <div className="mb-8">
                    <MatchHeader match={match} />
                </div>

                {/* Match Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Events Timeline */}
                    <div className="lg:col-span-2">
                        <MatchEvents events={eventsData.events} />
                    </div>

                    {/* Match Stats */}
                    <div>
                        {stats && <MatchStats stats={stats} />}
                    </div>
                </div>
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

            <div className="relative z-10 container mx-auto px-4 py-8">
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

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return (
        <Suspense fallback={<MatchLoadingSkeleton />}>
            <MatchData id={id} />
        </Suspense>
    );
}
