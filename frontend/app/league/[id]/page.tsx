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
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-8 backdrop-blur-md shadow-[0_0_30px_rgba(2,44,34,0.3)]">
                        {/* Background effects */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

                        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
                            <div>
                                <div className="flex items-center gap-3 mb-2 text-emerald-400 text-xs font-bold tracking-[0.2em] uppercase">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Active Competition
                                </div>
                                <h1 className="text-5xl md:text-6xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-emerald-200 to-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)] mb-2 pr-4 pb-1">
                                    {league.name}
                                </h1>
                                <div className="flex items-center gap-4 text-sm font-mono text-emerald-100/70">
                                    <div className="px-3 py-1 rounded bg-black/40 border border-emerald-500/20">
                                        TIER <span className="text-emerald-400 font-bold">{league.tier}</span>
                                    </div>
                                    <div className="px-3 py-1 rounded bg-black/40 border border-emerald-500/20">
                                        DIVISION <span className="text-emerald-400 font-bold">{league.division}</span>
                                    </div>
                                    <div className="px-3 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold animate-pulse">
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
                        <FixturesList matches={matches} />
                    </div>
                </div>
            </div>
        );
    } catch (error) {
        console.error('Failed to load league data:', error);
        notFound();
    }
}
