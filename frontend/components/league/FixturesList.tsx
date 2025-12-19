'use client';

import { useState } from 'react';
import { Match } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import {
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Clock,
    ClipboardList,
    CheckCircle,
    Trophy,
    Award,
    Swords,
    Handshake,
    Flag
} from 'lucide-react';
import { clsx } from 'clsx';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface FixturesListProps {
    matches: Match[];
    initialMode?: 'list' | 'week';
}

export default function FixturesList({ matches, initialMode = 'list' }: FixturesListProps) {
    const { user } = useAuth();
    const router = useRouter();
    const [mode, setMode] = useState<'list' | 'week'>(initialMode);

    // List mode state
    const [limit, setLimit] = useState(5);

    // Week mode state
    const [currentWeek, setCurrentWeek] = useState(1);
    const totalWeeks = Math.max(...matches.map(m => m.week), 1);

    const sortedMatches = [...matches].sort((a, b) => a.week - b.week);

    const displayedMatches = mode === 'list'
        ? sortedMatches.slice(0, limit)
        : sortedMatches.filter(m => m.week === currentWeek);

    const toggleLimit = () => {
        if (limit === 5) {
            setLimit(matches.length);
        } else {
            setLimit(5);
        }
    };

    const nextWeek = () => setCurrentWeek(prev => Math.min(prev + 1, totalWeeks));
    const prevWeek = () => setCurrentWeek(prev => Math.max(prev - 1, 1));

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'league': return <Trophy size={14} className="text-amber-500" />;
            case 'cup': return <Award size={14} className="text-rose-500" />;
            case 'tournament': return <Swords size={14} className="text-blue-500" />;
            case 'friendly': return <Handshake size={14} className="text-emerald-500" />;
            case 'national_team': return <Flag size={14} className="text-indigo-500" />;
            default: return <Clock size={14} />;
        }
    };

    return (
        <div className="rounded-2xl border transition-all duration-300 overflow-hidden h-full
            bg-white border-emerald-500/40 shadow-none
            dark:bg-black/40 dark:border-emerald-900/50 dark:backdrop-blur-sm dark:shadow-[0_0_20px_rgba(2,44,34,0.3)]">
            <div className="px-6 h-[72px] border-b flex items-center justify-between
                bg-white border-emerald-500/40
                dark:bg-emerald-950/20 dark:border-emerald-900/50">
                <h3 className="text-lg font-bold tracking-wider uppercase flex items-center gap-2
                    text-emerald-900 dark:text-white">
                    <span className="text-emerald-500">📅</span> Matches
                </h3>

                {mode === 'list' ? (
                    matches.length > 5 && (
                        <button
                            onClick={toggleLimit}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all
                                bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100
                                dark:bg-black/60 dark:text-emerald-400 dark:border-emerald-900/50 dark:hover:bg-emerald-900/20"
                        >
                            {limit === 5 ? (
                                <>Show All <ChevronDown size={14} /></>
                            ) : (
                                <>Show Less <ChevronLeft size={14} className="rotate-90" /></>
                            )}
                        </button>
                    )
                ) : (
                    <div className="flex items-center gap-4 rounded-lg p-1 border
                        bg-emerald-50 border-emerald-200
                        dark:bg-black/60 dark:border-emerald-900/50">
                        <button
                            onClick={prevWeek}
                            disabled={currentWeek === 1}
                            className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                text-emerald-600 hover:bg-emerald-200 hover:text-emerald-900
                                dark:text-emerald-500 dark:hover:bg-emerald-900/30 dark:hover:text-white"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <span className="text-sm font-bold min-w-[5rem] text-center tracking-widest
                            text-emerald-800 dark:text-emerald-100">
                            W{currentWeek.toString().padStart(2, '0')}
                        </span>
                        <button
                            onClick={nextWeek}
                            disabled={currentWeek === totalWeeks}
                            className="p-1 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors
                                text-emerald-600 hover:bg-emerald-200 hover:text-emerald-900
                                dark:text-emerald-500 dark:hover:bg-emerald-900/30 dark:hover:text-white"
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                )}
            </div>

            <div className={clsx(
                "divide-y transition-all duration-500 ease-in-out",
                mode === 'list' && limit === 5 ? "max-h-[600px] overflow-y-auto" : "max-h-none overflow-visible",
                "divide-emerald-100 dark:divide-emerald-900/30"
            )}>
                {displayedMatches.length === 0 ? (
                    <div className="p-8 text-center text-emerald-700/50 italic">
                        No matches scheduled.
                    </div>
                ) : (
                    displayedMatches.map((match) => (
                        <div
                            key={match.id}
                            onClick={() => router.push(`/matches/live/${match.id}`)}
                            className="block p-4 transition-colors group border-l-2 border-transparent cursor-pointer
                                hover:bg-emerald-50 
                                dark:hover:bg-emerald-900/10"
                        >
                            <div className="flex items-center justify-between text-sm mb-3">
                                <div className="flex items-center gap-3 text-slate-500 dark:text-emerald-600/70">
                                    <div className="flex items-center gap-1.5 min-w-[140px]">
                                        {getTypeIcon(match.type)}
                                        <span className="font-mono text-xs font-bold tracking-tight">
                                            {new Date(match.scheduledAt).toLocaleDateString('en-CA')} {new Date(match.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold uppercase tracking-tighter bg-emerald-100/30 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded text-emerald-600 dark:text-emerald-400">
                                        WEEK {match.week.toString().padStart(2, '0')}
                                    </span>
                                </div>

                            </div>

                            <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                                <div className="flex items-center gap-2 text-right justify-end">
                                    <span className="font-bold text-base transition-colors text-emerald-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300">
                                        <Link href={`/teams/${match.homeTeamId}`} className="hover:underline decoration-emerald-500/50" onClick={(e) => e.stopPropagation()}>
                                            {match.homeTeam?.name || 'Home Team'}
                                        </Link>
                                    </span>
                                    {match.status !== 'completed' && (
                                        match.homeTeamId === user?.teamId ? (
                                            <Link
                                                href={`/matches/${match.id}/tactics/${match.homeTeamId}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className={clsx(
                                                    "p-1.5 rounded-md transition-colors",
                                                    match.homeTacticsSet
                                                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                        : "hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 dark:text-emerald-600 dark:hover:text-emerald-400"
                                                )}
                                                title={match.homeTacticsSet ? "Tactics Set" : "Set Tactics"}
                                            >
                                                {match.homeTacticsSet ? <CheckCircle size={16} /> : <ClipboardList size={16} />}
                                            </Link>
                                        ) : (
                                            <div
                                                className="p-1.5 rounded-md text-slate-300 dark:text-slate-800 cursor-not-allowed"
                                                title="View Only"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {match.homeTacticsSet ? <CheckCircle size={16} /> : <ClipboardList size={16} />}
                                            </div>
                                        )
                                    )}
                                </div>

                                <div className="px-4 py-1.5 rounded-lg border font-mono font-black text-lg min-w-[80px] text-center transition-all
                                    bg-emerald-50 border-emerald-200 text-emerald-800 shadow-none
                                    dark:bg-black/60 dark:border-emerald-900/50 dark:text-emerald-400 dark:shadow-inner dark:shadow-emerald-950">
                                    {match.status === 'scheduled' ? 'vs' : `${match.homeScore} - ${match.awayScore}`}
                                </div>

                                <div className="flex items-center gap-2 text-left justify-start">
                                    {match.status !== 'completed' && (
                                        match.awayTeamId === user?.teamId ? (
                                            <Link
                                                href={`/matches/${match.id}/tactics/${match.awayTeamId}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className={clsx(
                                                    "p-1.5 rounded-md transition-colors",
                                                    match.awayTacticsSet
                                                        ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
                                                        : "hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-slate-400 hover:text-emerald-600 dark:text-emerald-600 dark:hover:text-emerald-400"
                                                )}
                                                title={match.awayTacticsSet ? "Tactics Set" : "Set Tactics"}
                                            >
                                                {match.awayTacticsSet ? <CheckCircle size={16} /> : <ClipboardList size={16} />}
                                            </Link>
                                        ) : (
                                            <div
                                                className="p-1.5 rounded-md text-slate-300 dark:text-slate-800 cursor-not-allowed"
                                                title="View Only"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {match.awayTacticsSet ? <CheckCircle size={16} /> : <ClipboardList size={16} />}
                                            </div>
                                        )
                                    )}
                                    <span className="font-bold text-base transition-colors text-emerald-900 hover:text-emerald-700 dark:text-white dark:hover:text-emerald-300">
                                        <Link href={`/teams/${match.awayTeamId}`} className="hover:underline decoration-emerald-500/50" onClick={(e) => e.stopPropagation()}>
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
