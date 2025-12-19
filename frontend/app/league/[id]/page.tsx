import { api } from '@/lib/api';
import StandingsTable from '@/components/league/StandingsTable';
import FixturesList from '@/components/league/FixturesList';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function LeagueDashboard({ params }: PageProps) {
    const { id } = await params;

    try {
        const [league, standings, matches] = await Promise.all([
            api.getLeague(id),
            api.getStandings(id),
            api.getMatches(id)
        ]);

        return (
            <div className="container mx-auto px-4 py-8">
                <div className="mb-12">
                    <div className="relative overflow-hidden rounded-2xl border transition-all duration-300 p-8
                        bg-white border-emerald-500/40 shadow-none
                        dark:border-emerald-500/20 dark:bg-emerald-950/20 dark:backdrop-blur-md dark:shadow-[0_0_30px_rgba(2,44,34,0.3)]">
                        {/* Background effects */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2 text-xs font-bold tracking-[0.2em] uppercase
                                    text-emerald-700 dark:text-emerald-400">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Active Competition
                                </div>
                                <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter mb-2 pr-4 pb-1
                                    text-emerald-900
                                    dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-r dark:from-white dark:via-emerald-200 dark:to-emerald-400 dark:drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                                    {league.name}
                                </h1>
                                <div className="flex items-center gap-4 text-sm font-mono
                                    text-emerald-600/70 dark:text-emerald-100/70">
                                    <div className="px-3 py-1 rounded border
                                        bg-white border-emerald-500/40
                                        dark:bg-black/40 dark:border-emerald-500/20">
                                        TIER <span className="font-bold text-emerald-700 dark:text-emerald-400">{league.tier}</span>
                                    </div>
                                    <div className="px-3 py-1 rounded border
                                        bg-white border-emerald-500/40
                                        dark:bg-black/40 dark:border-emerald-500/20">
                                        DIVISION <span className="font-bold text-emerald-700 dark:text-emerald-400">{league.division}</span>
                                    </div>
                                    <div className="px-3 py-1 rounded border font-bold animate-pulse
                                        bg-emerald-50 border-emerald-500/40 text-emerald-700
                                        dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-400">
                                        {league.status.toUpperCase()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <StandingsTable standings={standings} />
                    </div>
                    <div className="lg:col-span-1">
                        <FixturesList matches={matches} initialMode="week" />
                    </div>
                </div>
            </div>
        );
    } catch (error) {
        console.error('Failed to load league data:', error);
        notFound();
    }
}
