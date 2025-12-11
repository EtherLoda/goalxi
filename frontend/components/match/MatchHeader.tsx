
import React from 'react';
import { Match } from '@/lib/api';
import { clsx } from 'clsx';

interface MatchHeaderProps {
    match: Match;
}

export function MatchHeader({ match }: MatchHeaderProps) {
    const isLive = match.status === 'in_progress';
    const isCompleted = match.status === 'completed';

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div className="bg-slate-800 rounded-lg p-6 mb-6 shadow-lg border border-slate-700 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

            <div className="flex flex-col md:flex-row items-center justify-between">

                {/* Home Team */}
                <div className="flex flex-col items-center flex-1">
                    <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-2 border-2 border-slate-600">
                        {match.homeTeam?.logoUrl ? (
                            <img src={match.homeTeam.logoUrl} alt={match.homeTeam.name} className="w-16 h-16 object-contain" />
                        ) : (
                            <span className="text-2xl font-bold text-slate-400">{match.homeTeam?.name?.substring(0, 2).toUpperCase() ?? 'HM'}</span>
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-white text-center">{match.homeTeam?.name ?? 'Home Team'}</h2>
                </div>

                {/* Score / Time */}
                <div className="flex flex-col items-center mx-8 my-4 md:my-0 min-w-[150px]">
                    {isLive && (
                        <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse mb-2">
                            LIVE
                        </span>
                    )}
                    {(isCompleted || isLive) ? (
                        <div className="text-5xl font-black text-white tracking-widest bg-slate-900/50 px-6 py-2 rounded-lg border border-slate-700">
                            {match.homeScore} - {match.awayScore}
                        </div>
                    ) : (
                        <div className="text-3xl font-bold text-slate-400 bg-slate-900/30 px-4 py-2 rounded">
                            VS
                        </div>
                    )}

                    <div className="mt-2 text-slate-400 text-sm font-medium">
                        {isCompleted ? 'Full Time' : formatDate(match.scheduledAt)}
                    </div>
                </div>

                {/* Away Team */}
                <div className="flex flex-col items-center flex-1">
                    <div className="w-20 h-20 bg-slate-700 rounded-full flex items-center justify-center mb-2 border-2 border-slate-600">
                        {match.awayTeam?.logoUrl ? (
                            <img src={match.awayTeam.logoUrl} alt={match.awayTeam.name} className="w-16 h-16 object-contain" />
                        ) : (
                            <span className="text-2xl font-bold text-slate-400">{match.awayTeam?.name?.substring(0, 2).toUpperCase() ?? 'AW'}</span>
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-white text-center">{match.awayTeam?.name ?? 'Away Team'}</h2>
                </div>
            </div>
        </div>
    );
}
