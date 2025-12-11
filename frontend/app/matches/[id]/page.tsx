
import React from 'react';
import { api } from '@/lib/api';
import { MatchHeader } from '@/components/match/MatchHeader';
import { MatchEvents } from '@/components/match/MatchEvents';
import { MatchStats } from '@/components/match/MatchStats';
import Link from 'next/link';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    // Fetch Data
    const match = await api.getMatch(id);
    const eventsData = await api.getMatchEvents(id);

    // Stats might not exist if match is not started/completed, handle gracefully
    let stats = null;
    try {
        stats = await api.getMatchStats(id);
    } catch (e) {
        // Ignore error if stats not found (e.g. match scheduled)
    }

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="mb-4">
                <Link href={`/league/${match.leagueId}`} className="text-sm text-slate-400 hover:text-white transition-colors">
                    ← Back to League
                </Link>
            </div>

            <MatchHeader match={match} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div>
                    <MatchEvents
                        events={eventsData.events}
                        homeTeamId={match.homeTeamId}
                        awayTeamId={match.awayTeamId}
                    />
                </div>
                <div>
                    {stats ? (
                        <MatchStats
                            stats={stats}
                            homeTeamName={match.homeTeam?.name ?? 'Home'}
                            awayTeamName={match.awayTeam?.name ?? 'Away'}
                        />
                    ) : (
                        <div className="bg-slate-800 rounded-lg p-6 shadow-lg border border-slate-700 text-center text-slate-400">
                            Statistics available after kick-off
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
