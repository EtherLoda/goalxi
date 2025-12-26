'use client';

import { useMatchPolling } from '@/hooks/useMatchPolling';
import { useMatchSimulation } from '@/hooks/useMatchSimulation';
import { MatchEvents } from '@/components/match/MatchEvents';
import { MatchStats } from '@/components/match/MatchStats';
import { MatchEventsResponse, MatchStatsRes } from '@/lib/api';
import { Play, Loader2 } from 'lucide-react';

interface LiveMatchViewerProps {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    initialEventsData: MatchEventsResponse;
    initialStats: MatchStatsRes | null;
    matchStatus: string;
}

export function LiveMatchViewer({
    matchId,
    homeTeamId,
    awayTeamId,
    homeTeamName,
    awayTeamName,
    initialEventsData,
    initialStats,
    matchStatus,
}: LiveMatchViewerProps) {
    // We use useMatchPolling for regular 5-minute updates
    // and useMatchSimulation if we want to manually trigger/follow a simulation.
    // However, the plan specifically asks to use the new polling hook.
    const { data: pollingData } = useMatchPolling(matchId, initialEventsData);
    const { startSimulation, isSimulating, error, data: simData } = useMatchSimulation(matchId, initialEventsData);

    const data = simData || pollingData || initialEventsData;
    const eventsData = data;
    const canSimulate = matchStatus === 'scheduled' || matchStatus === 'tactics_locked';

    return (
        <>
            {/* Simulation Control */}
            {canSimulate && (
                <div className="mb-6">
                    <button
                        onClick={startSimulation}
                        disabled={isSimulating}
                        className="group relative px-8 py-4 border-2 overflow-hidden transition-all rounded-xl
                            bg-white border-emerald-500/40 hover:border-emerald-500 shadow-none disabled:opacity-50 disabled:cursor-not-allowed
                            dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:hover:border-emerald-400"
                    >
                        <div className="absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl 
                            bg-emerald-50 dark:bg-emerald-500/10"></div>
                        <span className="relative font-bold uppercase tracking-widest transition-colors flex items-center gap-3 
                            text-emerald-900 group-hover:text-emerald-700
                            dark:text-emerald-400 dark:group-hover:text-white">
                            {isSimulating ? (
                                <>
                                    <Loader2 size={20} className="animate-spin" />
                                    Simulating Match...
                                </>
                            ) : (
                                <>
                                    <Play size={20} />
                                    Simulate Match
                                </>
                            )}
                        </span>
                    </button>
                    {error && (
                        <p className="mt-2 text-sm text-red-500 dark:text-red-400">{error}</p>
                    )}
                </div>
            )}

            {/* Match Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Events Timeline */}
                <div className="lg:col-span-2">
                    <MatchEvents
                        events={eventsData.events}
                        homeTeamId={homeTeamId}
                        awayTeamId={awayTeamId}
                    />
                </div>

                {/* Match Stats */}
                <div>
                    {initialStats && <MatchStats
                        stats={initialStats}
                        homeTeamName={homeTeamName}
                        awayTeamName={awayTeamName}
                    />}
                </div>
            </div>
        </>
    );
}
