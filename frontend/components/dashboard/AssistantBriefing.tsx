import { useEffect, useState } from 'react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance } from '@/utils/playerUtils';
import { ArrowRight, TrendingUp, Calendar, AlertCircle, DollarSign, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthContext';
import { api, Match, Player, FinanceState } from '@/lib/api';
import { Skeleton } from '@/components/ui/SkeletonLoader';

export default function AssistantBriefing() {
    const { user } = useAuth();
    const [balance, setBalance] = useState<number | null>(null);
    const [nextMatch, setNextMatch] = useState<Match | null>(null);
    const [topPlayers, setTopPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);

    const assistantAppearance = generateAppearance('assistant-manager-xv2');

    useEffect(() => {
        const fetchBriefingData = async () => {
            if (!user?.teamId) {
                setLoading(false);
                return;
            }
            setLoading(true);
            try {
                const results = await Promise.allSettled([
                    api.getFinanceBalance(),
                    api.getMatches(undefined, 1, user.teamId),
                    api.getPlayers(user.teamId)
                ]);

                const [financeRes, matchesRes, playersRes] = results;

                if (financeRes.status === 'fulfilled') {
                    setBalance(financeRes.value.balance);
                }

                if (matchesRes.status === 'fulfilled' && matchesRes.value) {
                    const upcoming = (matchesRes.value as Match[])
                        .filter(m => m.status === 'scheduled')
                        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
                    setNextMatch(upcoming);
                }

                if (playersRes.status === 'fulfilled' && playersRes.value.data) {
                    const sortedPlayers = [...playersRes.value.data].sort((a, b) => b.overall - a.overall).slice(0, 2);
                    setTopPlayers(sortedPlayers);
                }
            } catch (error) {
                console.error('Failed to fetch briefing data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchBriefingData();
    }, [user?.teamId]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    if (loading) {
        return (
            <div className="p-8 max-w-7xl mx-auto space-y-8 animate-pulse">
                <div className="h-32 bg-emerald-500/5 rounded-2xl border border-emerald-500/10" />
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="h-48 bg-emerald-500/5 rounded-xl border border-emerald-500/10" />
                    <div className="h-48 bg-emerald-500/5 rounded-xl border border-emerald-500/10" />
                    <div className="h-48 bg-emerald-500/5 rounded-xl border border-emerald-500/10" />
                </div>
            </div>
        );
    }

    const opponent = nextMatch?.homeTeamId === user?.teamId ? nextMatch?.awayTeam : nextMatch?.homeTeam;

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header: Assistant Speaking */}
            <div className="flex flex-col md:flex-row items-start gap-6 bg-white dark:bg-emerald-950/20 p-6 rounded-2xl border border-emerald-500/20 relative overflow-hidden">
                <div className="shrink-0 relative z-10 mx-auto md:mx-0">
                    <div className="w-32 h-32 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center border-2 border-emerald-500/30">
                        <MiniPlayer appearance={assistantAppearance} position="MID" size={100} />
                    </div>
                    <div className="absolute -bottom-2 -right-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white dark:border-black uppercase tracking-wider">
                        Assistant
                    </div>
                </div>

                <div className="flex-1 relative z-10 text-center md:text-left">
                    <h2 className="text-2xl font-black italic text-slate-900 dark:text-white mb-2 uppercase tracking-tighter">
                        Morning, Boss.
                    </h2>
                    <p className="text-lg text-slate-600 dark:text-emerald-100/80 leading-relaxed font-medium">
                        "The squad is looking sharp. {topPlayers[0] && (
                            <>
                                <strong className="text-emerald-600 dark:text-emerald-400">{topPlayers[0].name}</strong> is leading by example.
                            </>
                        )}
                        {nextMatch ? (
                            <> I've prepared a brief on our upcoming fixture against <strong className="text-emerald-600 dark:text-emerald-400">{opponent?.name}</strong>."</>
                        ) : (
                            <> No matches scheduled currently, we focus on training."</>
                        )}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2 justify-center md:justify-start">
                        <div className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-xs font-bold flex items-center gap-1">
                            <TrendingUp size={12} /> Squard Ready
                        </div>
                        <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs font-bold flex items-center gap-1">
                            <DollarSign size={12} /> Budget Secure
                        </div>
                    </div>
                </div>

                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -translate-y-1/2 translate-x-1/2"></div>
            </div>

            {/* Dashboard Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

                {/* Card 1: Player Development */}
                <div className="bg-white dark:bg-black/40 border border-emerald-900/20 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold uppercase text-xs tracking-wider">
                            <TrendingUp size={16} /> Key Players
                        </div>
                        <span className="text-xs text-slate-500">Overview</span>
                    </div>

                    <div className="space-y-4">
                        {topPlayers.map(p => (
                            <div key={p.id} className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-[10px] font-black italic color-emerald-500 border border-emerald-500/20">
                                    {p.overall}
                                </div>
                                <div>
                                    <div className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</div>
                                    <div className="text-xs text-emerald-500 font-bold uppercase tracking-widest">{p.position}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <Link href={`/teams/${user?.teamId}`} className="mt-6 flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-emerald-500 transition-colors">
                        View Full Squad <ArrowRight size={12} />
                    </Link>
                </div>

                {/* Card 2: Next Match */}
                <div className="bg-white dark:bg-black/40 border border-emerald-900/20 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold uppercase text-xs tracking-wider">
                            <Calendar size={16} /> Next Match
                        </div>
                        <span className="text-xs text-slate-500">
                            {nextMatch ? new Date(nextMatch.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </span>
                    </div>

                    {nextMatch ? (
                        <div className="text-center py-2">
                            <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-1">Week {nextMatch.week}</div>
                            <div className="flex items-center justify-center gap-4">
                                <div className="font-black text-xl text-slate-900 dark:text-white truncate max-w-[80px]">{nextMatch.homeTeam?.name?.substring(0, 3).toUpperCase()}</div>
                                <div className="px-2 py-1 bg-emerald-500/10 rounded text-[10px] font-black text-emerald-500">VS</div>
                                <div className="font-black text-xl text-slate-900 dark:text-white truncate max-w-[80px]">{nextMatch.awayTeam?.name?.substring(0, 3).toUpperCase()}</div>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">
                                {new Date(nextMatch.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                        </div>
                    ) : (
                        <div className="text-center py-6 text-slate-500 italic text-sm">
                            No upcoming fixtures
                        </div>
                    )}

                    <Link href="/matches" className="mt-4 flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-emerald-500 transition-colors">
                        View All Matches <ArrowRight size={12} />
                    </Link>
                </div>

                {/* Card 3: Finance */}
                <div className="bg-white dark:bg-black/40 border border-emerald-900/20 rounded-xl p-5 hover:border-emerald-500/30 transition-colors group">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 font-bold uppercase text-xs tracking-wider">
                            <DollarSign size={16} /> Finance
                        </div>
                        <span className="text-xs text-slate-500">Budget</span>
                    </div>

                    <div className="space-y-3">
                        <div className="text-3xl font-black italic text-emerald-900 dark:text-white tracking-tighter">
                            {balance !== null ? formatCurrency(balance) : '---'}
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                            Your club's current treasury. Keep an eye on wages and bonuses.
                        </p>
                    </div>

                    <Link href="/club/finance" className="mt-8 flex items-center gap-1 text-xs font-bold text-slate-400 group-hover:text-emerald-500 transition-colors">
                        View Detailed Financials <ArrowRight size={12} />
                    </Link>
                </div>

            </div>
        </div>
    );
}
