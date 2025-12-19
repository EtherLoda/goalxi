'use client';

import { api, Match, Team } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import { useEffect, useState, use } from 'react';
import { LayoutGrid, List as ListIcon, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/SkeletonLoader';
import FixturesList from '@/components/league/FixturesList';
import Link from 'next/link';
import { clsx } from 'clsx';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function TeamMatchesPage({ params }: PageProps) {
    const { id: teamId } = use(params);
    const { user } = useAuth();
    const [matches, setMatches] = useState<Match[]>([]);
    const [team, setTeam] = useState<Team | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [teamData, matchesData] = await Promise.all([
                    api.getTeam(teamId),
                    // Fetch all matches for the team's league to show the full context if needed, 
                    // or just team matches. Let's fetch by teamId since we are on the team fixtures page.
                    api.getMatches(undefined, 1, teamId)
                ]);
                setTeam(teamData);
                setMatches(matchesData);
            } catch (error) {
                console.error('Failed to fetch team fixtures:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [teamId]);

    if (loading) {
        return (
            <div className="container mx-auto px-4 py-8 space-y-8">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-[600px] w-full rounded-2xl" />
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2 text-xs font-bold tracking-[0.2em] uppercase text-emerald-600 dark:text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Team Schedule
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-emerald-900 dark:text-white uppercase">
                        {team?.name} MATCHES
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <Link
                        href="/matches"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all border border-emerald-500/20 text-slate-500 hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                    >
                        <ListIcon size={18} /> All League Matches
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-8">
                <div className="relative overflow-hidden rounded-2xl border bg-white border-emerald-500/40 dark:bg-emerald-950/20 dark:border-emerald-500/10 min-h-[600px]">
                    <FixturesList matches={matches} />
                </div>
            </div>
        </div>
    );
}
