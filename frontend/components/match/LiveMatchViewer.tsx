'use client';

import { useMatchPolling } from '@/hooks/useMatchPolling';
import { useMatchSimulation } from '@/hooks/useMatchSimulation';
import { MatchEvents } from '@/components/match/MatchEvents';
import { MatchStats } from '@/components/match/MatchStats';
import { TeamLineupView } from '@/components/match/TeamLineupView';
import { MatchPitchView } from '@/components/match/MatchPitchView';
import { MatchTimeline } from '@/components/match/MatchTimeline';
import { TacticalAnalysis } from '@/components/match/TacticalAnalysis';
import { MatchEventsResponse, MatchStatsRes, TeamSnapshot } from '@/lib/api';
import { Play, Loader2, Clock } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

interface LiveMatchViewerProps {
    matchId: string;
    homeTeamId: string;
    awayTeamId: string;
    homeTeamName: string;
    awayTeamName: string;
    initialEventsData: MatchEventsResponse;
    initialStats: MatchStatsRes | null;
    matchStatus: string;
    onScoreUpdate?: (score: { home: number; away: number }) => void; // Callback to update parent
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
    onScoreUpdate,
}: LiveMatchViewerProps) {
    // We use useMatchPolling for regular 5-second updates
    // and useMatchSimulation if we want to manually trigger/follow a simulation.
    const { data: pollingData } = useMatchPolling(matchId, initialEventsData);
    const { startSimulation, isSimulating, error, data: simData } = useMatchSimulation(matchId, initialEventsData);

    const data = simData || pollingData || initialEventsData;
    const eventsData = data;
    const canSimulate = matchStatus === 'scheduled' || matchStatus === 'tactics_locked';
    const isLive = matchStatus === 'in_progress';
    const isCompleted = matchStatus === 'completed';

    // Notify parent of score updates
    useEffect(() => {
        if (onScoreUpdate && eventsData.currentScore) {
            onScoreUpdate(eventsData.currentScore);
        }
    }, [eventsData.currentScore, onScoreUpdate]);

    // Live match minute display
    const [liveMinute, setLiveMinute] = useState(eventsData.currentMinute || 0);
    
    // Selected minute for timeline scrubbing
    const [selectedMinute, setSelectedMinute] = useState(eventsData.currentMinute || 0);

    // Update live minute when data changes
    useEffect(() => {
        setLiveMinute(eventsData.currentMinute || 0);
        // Auto-update selectedMinute to follow live match if not manually scrubbing
        if (selectedMinute === liveMinute || selectedMinute === 0) {
            setSelectedMinute(eventsData.currentMinute || 0);
        }
    }, [eventsData.currentMinute]);

    // Extract player states from snapshot at selected minute
    const { homeSnapshot, awaySnapshot, initialStamina } = useMemo(() => {
        // Find all snapshot events
        const snapshotEvents = eventsData.events.filter(e => {
            const typeName = typeof e.typeName === 'string' ? e.typeName.toUpperCase() : '';
            const type = typeof e.type === 'string' ? e.type.toUpperCase() : '';
            return typeName === 'SNAPSHOT' || type === 'SNAPSHOT';
        });

        // Get the first snapshot (minute 0) to extract initial stamina values
        const firstSnapshot = snapshotEvents
            .sort((a, b) => a.minute - b.minute)[0];
        
        // Create a map of playerId -> initial stamina from minute 0
        const initialStaminaMap = new Map<string, number>();
        if (firstSnapshot?.data) {
            const homeData = firstSnapshot.data.home as TeamSnapshot | null;
            const awayData = firstSnapshot.data.away as TeamSnapshot | null;
            
            homeData?.players?.forEach(p => {
                initialStaminaMap.set(p.playerId, p.stamina);
            });
            awayData?.players?.forEach(p => {
                initialStaminaMap.set(p.playerId, p.stamina);
            });
        }

        // Find the snapshot closest to (but not after) the selected minute
        const relevantSnapshot = snapshotEvents
            .filter(s => s.minute <= selectedMinute)
            .sort((a, b) => b.minute - a.minute)[0]; // Get the most recent one

        if (!relevantSnapshot?.data) {
            return { homeSnapshot: null, awaySnapshot: null, initialStamina: initialStaminaMap };
        }

        return {
            homeSnapshot: relevantSnapshot.data.home as TeamSnapshot | null,
            awaySnapshot: relevantSnapshot.data.away as TeamSnapshot | null,
            initialStamina: initialStaminaMap
        };
    }, [eventsData.events, selectedMinute]);

    return (
        <>
            {/* Simulation Control */}
            {canSimulate && (
                <div className="mb-6">
                    <button
                        onClick={startSimulation}
                        disabled={isSimulating}
                        className="group relative px-8 py-4 border-2 overflow-hidden transition-all rounded-xl bg-white border-emerald-500/40 hover:border-emerald-500 shadow-none disabled:opacity-50 disabled:cursor-not-allowed dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:hover:border-emerald-400"
                    >
                        <div className="absolute inset-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-xl bg-emerald-50 dark:bg-emerald-500/10"></div>
                        <span className="relative font-bold uppercase tracking-widest transition-colors flex items-center gap-3 text-emerald-900 group-hover:text-emerald-700 dark:text-emerald-400 dark:group-hover:text-white">
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

            {/* Team Lineups - HIDDEN as per requirements */}
            {/* {(homeSnapshot || awaySnapshot) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {homeSnapshot && (
                        <TeamLineupView
                            teamName={homeSnapshot.teamName || homeTeamName}
                            players={homeSnapshot.players || []}
                        />
                    )}
                    {awaySnapshot && (
                        <TeamLineupView
                            teamName={awaySnapshot.teamName || awayTeamName}
                            players={awaySnapshot.players || []}
                        />
                    )}
                </div>
            )} */}

            {/* Match Content Grid */}
            <div className="space-y-6">
                {/* Debug info - remove after testing */}
                {process.env.NODE_ENV === 'development' && (
                    <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg text-xs font-mono">
                        <div>Total events: {eventsData.events.length}</div>
                        <div>Snapshot events found: {eventsData.events.filter(e => {
                            const typeName = typeof e.typeName === 'string' ? e.typeName.toUpperCase() : '';
                            const type = typeof e.type === 'string' ? e.type.toUpperCase() : '';
                            return typeName === 'SNAPSHOT' || type === 'SNAPSHOT';
                        }).length}</div>
                        <div>Selected minute: {selectedMinute}</div>
                        <div>homeSnapshot: {homeSnapshot ? '✓ has data' : '✗ null'}</div>
                        <div>awaySnapshot: {awaySnapshot ? '✓ has data' : '✗ null'}</div>
                        <div>homePlayers: {homeSnapshot?.players?.length || 0}</div>
                        <div>awayPlayers: {awaySnapshot?.players?.length || 0}</div>
                        {homeSnapshot?.players?.[0] && (
                            <div className="mt-2 p-2 bg-blue-100 dark:bg-blue-900/30 rounded">
                                <div className="font-bold">Sample Player Data (first home player):</div>
                                <div>Name: {homeSnapshot.players[0].name}</div>
                                <div>Position: {homeSnapshot.players[0].position}</div>
                                <div>Overall: {homeSnapshot.players[0].overall ?? 'MISSING'}</div>
                                <div>PositionalContrib: {homeSnapshot.players[0].positionalContribution ?? 'MISSING'}</div>
                                <div>ConditionMult: {homeSnapshot.players[0].conditionMultiplier ?? 'MISSING'}</div>
                                <div>Stamina: {homeSnapshot.players[0].stamina}</div>
                                <div className="font-bold mt-1">Performance = {homeSnapshot.players[0].positionalContribution ?? 0} × {homeSnapshot.players[0].conditionMultiplier ?? 1} = {Math.round((homeSnapshot.players[0].positionalContribution ?? 0) * (homeSnapshot.players[0].conditionMultiplier ?? 1))}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Match Timeline - Positioned above pitch for better visibility */}
                {(isLive || isCompleted) && eventsData.events.length > 0 && (
                    <MatchTimeline
                        events={eventsData.events}
                        totalMinutes={eventsData.totalMinutes || 90}
                        currentMinute={liveMinute}
                        onTimeSelect={(minute) => setSelectedMinute(minute)}
                    />
                )}

                {/* Tactical Analysis - Show 3-lane battle metrics */}
                {(homeSnapshot && awaySnapshot) && (
                    <div className="mb-6">
                        <TacticalAnalysis
                            homeSnapshot={homeSnapshot}
                            awaySnapshot={awaySnapshot}
                            homeTeamName={homeTeamName}
                            awayTeamName={awayTeamName}
                        />
                    </div>
                )}

                {/* Match Pitch View - Show formations with player stats */}
                {(homeSnapshot || awaySnapshot) && (
                    <div>
                        <MatchPitchView
                            homeTeamName={homeSnapshot?.teamName || homeTeamName}
                            awayTeamName={awaySnapshot?.teamName || awayTeamName}
                            homePlayers={homeSnapshot?.players || []}
                            awayPlayers={awaySnapshot?.players || []}
                            initialStamina={initialStamina}
                        />
                    </div>
                )}

                {/* Events Timeline - Centered */}
                <div className="max-w-4xl mx-auto">
                    <MatchEvents
                        events={eventsData.events}
                        homeTeamId={homeTeamId}
                        awayTeamId={awayTeamId}
                    />
                </div>

                {/* Match Stats - Two Columns Below */}
                {initialStats && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Home Team Stats */}
                        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white dark:bg-emerald-950/20 shadow-lg overflow-hidden">
                            <div className="p-5 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                                <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                                    {homeTeamName}
                                </h3>
                                <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">Home Team Stats</p>
                            </div>
                            <div className="p-6 space-y-4">
                                {initialStats.home && Object.entries(initialStats.home).map(([key, value]) => (
                                    <div key={key} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                                                {key.replace(/_/g, ' ')}
                                            </span>
                                            <span className="font-black text-emerald-900 dark:text-emerald-300 text-lg tabular-nums">
                                                {typeof value === 'number' ? value : value}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-blue-500 dark:bg-blue-600 rounded-full transition-all duration-500"
                                                style={{ 
                                                    width: typeof value === 'number' 
                                                        ? `${Math.min(100, (value / 20) * 100)}%` 
                                                        : '0%' 
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Away Team Stats */}
                        <div className="rounded-2xl border-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white dark:bg-emerald-950/20 shadow-lg overflow-hidden">
                            <div className="p-5 border-b-2 border-emerald-500/40 dark:border-emerald-500/30 bg-white/80 dark:bg-emerald-950/40 backdrop-blur-sm">
                                <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                                    {awayTeamName}
                                </h3>
                                <p className="text-xs text-emerald-700 dark:text-emerald-500 mt-1">Away Team Stats</p>
                            </div>
                            <div className="p-6 space-y-4">
                                {initialStats.away && Object.entries(initialStats.away).map(([key, value]) => (
                                    <div key={key} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                                                {key.replace(/_/g, ' ')}
                                            </span>
                                            <span className="font-black text-emerald-900 dark:text-emerald-300 text-lg tabular-nums">
                                                {typeof value === 'number' ? value : value}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-red-500 dark:bg-red-600 rounded-full transition-all duration-500"
                                                style={{ 
                                                    width: typeof value === 'number' 
                                                        ? `${Math.min(100, (value / 20) * 100)}%` 
                                                        : '0%' 
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
