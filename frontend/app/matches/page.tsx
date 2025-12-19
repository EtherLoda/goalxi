'use client';

import { api, Match } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import FixturesList from '@/components/league/FixturesList';
import Link from 'next/link';
import { clsx } from 'clsx';

export default function MatchesPage() {
    const { user } = useAuth();
    const [matches, setMatches] = useState<Match[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'league' | 'my-team'>('my-team');

    useEffect(() => {
        const fetchMatches = async () => {
            if (!user?.teamId) return;

            setLoading(true);
            try {
                // Fetch all matches for the user's team or league
                // For now, let's fetch by teamId as default view
                const matchesData = await api.getMatches(user.leagueId || 'elite-league');
                setMatches(matchesData);
            } catch (error) {
                console.error('Failed to fetch matches:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMatches();
    }, [user?.teamId, user?.leagueId]);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8 space-y-8">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-[600px] w-full rounded-2xl" />
            </div>
        );
    }

    const myMatches = matches.filter(m => m.homeTeamId === user?.teamId || m.awayTeamId === user?.teamId);

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2 text-xs font-bold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Competition Schedule
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-emerald-900 dark:text-white">
                        MATCHES
                    </h1>
                </div>

                <div className="flex items-center gap-2 p-1 rounded-xl bg-emerald-50 dark:bg-black/40 border border-emerald-500/20">
                    <button
                        onClick={() => setViewMode('my-team')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                            viewMode === 'my-team'
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                : "text-slate-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                        )}
                    >
                        <LayoutGrid size={18} /> My Squad
                    </button>
                    <button
                        onClick={() => setViewMode('league')}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all",
                            viewMode === 'league'
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
                                : "text-slate-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                        )}
                    >
                        <ListIcon size={18} /> Full League
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
                <div className="relative overflow-hidden rounded-2xl border bg-white border-emerald-500/40 dark:bg-emerald-950/20 dark:border-emerald-500/10 min-h-[600px]">
                    <FixturesList matches={viewMode === 'my-team' ? myMatches : matches} />
                </div>
            </div>
        </div>
    );
}
