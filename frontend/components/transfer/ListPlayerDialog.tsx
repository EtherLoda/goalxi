'use client';

import { useEffect, useState } from 'react';
import { api, Player } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import {
    X,
    ArrowRight,
    DollarSign,
    Clock,
    Briefcase,
    Loader2,
    Search,
    ChevronRight,
    Trophy,
    Zap
} from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, mapPosition } from '@/utils/playerUtils';
import { clsx } from 'clsx';
import { useNotification } from '@/components/ui/NotificationContext';

interface ListPlayerDialogProps {
    playerId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

export function ListPlayerDialog({ playerId, onClose, onSuccess }: ListPlayerDialogProps) {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Form States
    const [startPrice, setStartPrice] = useState<number>(0);
    const [buyoutPrice, setBuyoutPrice] = useState<number>(0);
    const [duration, setDuration] = useState<number>(24);

    useEffect(() => {
        const fetchPlayers = async () => {
            if (!user?.teamId) return;
            try {
                const data = await api.getPlayers(user.teamId);
                setPlayers(data.data);

                // Auto-select if playerId is provided
                if (playerId) {
                    const player = data.data.find(p => p.id === playerId);
                    if (player) {
                        setSelectedPlayer(player);
                        const baseValue = (player.overall ** 2) * 5000;
                        setStartPrice(Math.floor(baseValue * 0.8));
                        setBuyoutPrice(Math.floor(baseValue * 1.5));
                    }
                }
            } catch (error) {
                console.error('Failed to fetch players:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchPlayers();
    }, [user?.teamId, playerId]);

    const handleList = async () => {
        if (!selectedPlayer) return;
        if (startPrice <= 0) {
            showNotification({ message: 'Start price must be greater than 0', type: 'error' });
            return;
        }
        if (buyoutPrice <= startPrice) {
            showNotification({ message: 'Buyout price must be higher than starting price', type: 'error' });
            return;
        }

        setSubmitting(true);
        try {
            await api.createAuction(selectedPlayer.id, startPrice, buyoutPrice, duration);
            showNotification({ message: `${selectedPlayer.name} has been listed on the market!`, type: 'success' });
            onSuccess();
            onClose();
        } catch (error: any) {
            showNotification({ message: error.message || 'Failed to list player', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const filteredPlayers = players.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-4xl bg-white dark:bg-emerald-950 border-2 border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">

                {/* Left Side: Player Selection */}
                <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-emerald-500/10 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-black italic text-emerald-900 dark:text-white uppercase tracking-tighter">
                            SELECT PLAYER
                        </h2>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Your Squad</span>
                    </div>

                    <div className="relative mb-6">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                        <input
                            type="text"
                            placeholder="Search your squad..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-emerald-900/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-sm"
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <Loader2 className="animate-spin text-emerald-500" size={32} />
                            </div>
                        ) : filteredPlayers.length === 0 ? (
                            <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase tracking-widest">No players found</div>
                        ) : (
                            filteredPlayers.map(player => (
                                <button
                                    key={player.id}
                                    onClick={() => {
                                        setSelectedPlayer(player);
                                        // Set some reasonable defaults based on "value" (mocked)
                                        const baseValue = (player.overall ** 2) * 5000;
                                        setStartPrice(Math.floor(baseValue * 0.8));
                                        setBuyoutPrice(Math.floor(baseValue * 1.5));
                                    }}
                                    className={clsx(
                                        "w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all group",
                                        selectedPlayer?.id === player.id
                                            ? "border-emerald-500 bg-emerald-500/5 shadow-sm"
                                            : "border-transparent bg-slate-50 dark:bg-black/10 hover:border-emerald-500/30"
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-white dark:bg-emerald-900/20 rounded-lg flex items-center justify-center">
                                            <MiniPlayer
                                                appearance={player.appearance || generateAppearance(player.id)}
                                                position={mapPosition(player.position)}
                                                size={40}
                                            />
                                        </div>
                                        <div className="text-left">
                                            <div className="text-sm font-black italic text-slate-900 dark:text-white uppercase leading-none mb-1 group-hover:text-emerald-500 transition-colors">
                                                {player.name}
                                            </div>
                                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                {player.position} • OVR {player.overall}
                                            </div>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} className={clsx(
                                        "transition-transform",
                                        selectedPlayer?.id === player.id ? "text-emerald-500 translate-x-1" : "text-slate-300"
                                    )} />
                                </button>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Side: Listing Details */}
                <div className="w-full md:w-[380px] p-8 bg-emerald-50/30 dark:bg-black/40 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="font-black italic text-emerald-900 dark:text-white uppercase tracking-tighter text-xl">
                            LISTING DETAILS
                        </h3>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-emerald-900/30 transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {!selectedPlayer ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center py-10">
                            <Briefcase size={48} className="text-slate-300 mb-4" />
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest max-w-[200px]">
                                Select a player from your squad to get started
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-6 flex-1">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Starting Price</label>
                                    <div className="relative">
                                        <DollarSign size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="number"
                                            value={startPrice}
                                            onChange={(e) => setStartPrice(parseInt(e.target.value))}
                                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-black/20 border border-emerald-500/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-black text-lg italic"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Buyout Price</label>
                                        <span className="text-[9px] font-bold text-emerald-500 uppercase">Skip Bidding</span>
                                    </div>
                                    <div className="relative">
                                        <Zap size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="number"
                                            value={buyoutPrice}
                                            onChange={(e) => setBuyoutPrice(parseInt(e.target.value))}
                                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-black/20 border border-emerald-500/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-black text-lg italic"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Auction Duration</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {[2, 4, 12, 24].map(h => (
                                            <button
                                                key={h}
                                                onClick={() => setDuration(h)}
                                                className={clsx(
                                                    "py-2 rounded-lg text-[10px] font-black italic border transition-all",
                                                    duration === h
                                                        ? "bg-emerald-500 border-emerald-600 text-white shadow-md"
                                                        : "bg-white dark:bg-emerald-900/10 border-emerald-500/20 text-slate-500"
                                                )}
                                            >
                                                {h}H
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8 mt-8 border-t border-emerald-500/10 space-y-4">
                                <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Market Status</span>
                                        <span className="text-[10px] font-bold text-emerald-600 uppercase">Season 1</span>
                                    </div>
                                    <p className="text-[9px] text-slate-400 font-medium">Standard 5% listing fee will be deducted upon successful sale.</p>
                                </div>

                                <button
                                    onClick={handleList}
                                    disabled={submitting}
                                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black italic tracking-tight text-lg shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 size={24} className="animate-spin" /> : (
                                        <>
                                            <Trophy size={20} />
                                            CONFIRM LISTING
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
