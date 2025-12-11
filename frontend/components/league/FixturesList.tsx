'use client';

import { useState } from 'react';
import { Match } from '@/lib/api';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';

interface FixturesListProps {
    matches: Match[];
}

export default function FixturesList({ matches }: FixturesListProps) {
    const [currentWeek, setCurrentWeek] = useState(1);
    const totalWeeks = 14; // Fixed for now based on seed

    const filteredMatches = matches.filter(m => m.week === currentWeek);

    const nextWeek = () => setCurrentWeek(prev => Math.min(prev + 1, totalWeeks));
    const prevWeek = () => setCurrentWeek(prev => Math.max(prev - 1, 1));

    return (
        <div className="bg-black/40 rounded-2xl border border-emerald-900/50 backdrop-blur-sm overflow-hidden h-full shadow-[0_0_20px_rgba(2,44,34,0.3)]">
            <div className="bg-emerald-950/20 px-6 h-[72px] border-b border-emerald-900/50 flex items-center justify-between">
                <h3 className="text-lg font-bold text-white tracking-wider uppercase flex items-center gap-2">
                    <span className="text-emerald-500">📅</span> Fixtures
                </h3>

                <div className="flex items-center gap-4 bg-black/60 rounded-lg p-1 border border-emerald-900/50">
                    <button
                        onClick={prevWeek}
                        disabled={currentWeek === 1}
                        className="p-1 hover:bg-emerald-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed text-emerald-500 hover:text-white transition-colors"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className="text-sm font-bold text-emerald-100 min-w-[5rem] text-center tracking-widest">
                        WEEK {currentWeek.toString().padStart(2, '0')}
                    </span>
                    <button
                        onClick={nextWeek}
                        disabled={currentWeek === totalWeeks}
                        className="p-1 hover:bg-emerald-900/30 rounded disabled:opacity-30 disabled:cursor-not-allowed text-emerald-500 hover:text-white transition-colors"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            <div className="divide-y divide-emerald-900/30 max-h-[600px] overflow-y-auto">
                {filteredMatches.length === 0 ? (
                    <div className="p-8 text-center text-emerald-700/50 italic">
                        No matches scheduled for this week.
                    </div>
                ) : (
                    filteredMatches.map((match) => (
                        <div key={match.id} className="p-4 hover:bg-emerald-900/10 transition-colors group border-l-2 border-transparent">
                            <div className="flex items-center justify-between text-sm mb-3">
                                <div className="flex items-center gap-2 text-emerald-600/70">
                                    <Clock size={14} />
                                    <span className="font-mono text-xs">{new Date(match.scheduledAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                                <span className={clsx(
                                    "px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider border",
                                    match.status === 'completed' ? "bg-emerald-950/50 text-emerald-500 border-emerald-900/50" :
                                        match.status === 'in_progress' ? "bg-emerald-500/20 text-white border-emerald-500 animate-pulse" :
                                            "bg-blue-900/20 text-blue-400 border-blue-900/30"
                                )}>
                                    {match.status.replace('_', ' ')}
                                </span>
                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                                <div className="flex items-center gap-3 text-right justify-end">
                                    <span className={clsx("font-bold text-base transition-colors", match.homeScore! > match.awayScore! ? "text-emerald-300" : "text-emerald-100/70")}>
                                        <Link href={`/teams/${match.homeTeamId}`} className="hover:text-emerald-400 hover:underline decoration-emerald-500/50">
                                            {match.homeTeam?.name || 'Home Team'}
                                        </Link>
                                    </span>
                                    {/* Logo placeholder */}
                                    <div className="w-8 h-8 rounded-full bg-emerald-900/50 border border-emerald-500/30 flex-shrink-0" />
                                </div>

                                <div className="bg-black/60 px-4 py-1.5 rounded-lg border border-emerald-900/50 font-mono font-black text-lg text-emerald-400 min-w-[80px] text-center shadow-inner shadow-emerald-950">
                                    {match.status === 'scheduled' ? 'vs' : `${match.homeScore} - ${match.awayScore}`}
                                </div>

                                <div className="flex items-center gap-3 text-left justify-start">
                                    {/* Logo placeholder */}
                                    <div className="w-8 h-8 rounded-full bg-emerald-900/50 border border-emerald-500/30 flex-shrink-0" />
                                    <span className={clsx("font-bold text-base transition-colors", match.awayScore! > match.homeScore! ? "text-emerald-300" : "text-emerald-100/70")}>
                                        <Link href={`/teams/${match.awayTeamId}`} className="hover:text-emerald-400 hover:underline decoration-emerald-500/50">
                                            {match.awayTeam?.name || 'Away Team'}
                                        </Link>
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
