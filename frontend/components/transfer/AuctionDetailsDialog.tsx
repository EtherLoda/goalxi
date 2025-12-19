'use client';

import { useEffect, useState } from 'react';
import { api, Auction } from '@/lib/api';
import {
    X,
    ChevronRight,
    Zap,
    DollarSign,
    Gavel,
    Shield,
    ArrowUpRight,
    Loader2
} from 'lucide-react';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, mapPosition } from '@/utils/playerUtils';
import { clsx } from 'clsx';
import { useNotification } from '@/components/ui/NotificationContext';
import { Clock } from 'lucide-react';

interface AuctionDetailsDialogProps {
    auction: Auction;
    onClose: () => void;
    onUpdate: () => void;
}

export function AuctionDetailsDialog({ auction, onClose, onUpdate }: AuctionDetailsDialogProps) {
    const { showNotification } = useNotification();
    const [bidAmount, setBidAmount] = useState<number>(auction.currentPrice + 1000000); // Default +1M
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        if (auction.status !== 'ACTIVE') return;

        const updateTimer = () => {
            const ends = new Date(auction.expiresAt).getTime();
            const now = new Date().getTime();
            const diff = ends - now;

            if (diff <= 0) {
                setTimeLeft('EXPIRED');
                return;
            }

            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            setTimeLeft(`${h}h ${m}m ${s}s`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [auction.expiresAt, auction.status]);

    const handleBid = async () => {
        if (bidAmount <= auction.currentPrice) {
            showNotification({ message: 'Bid amount must be higher than current price', type: 'error' });
            return;
        }

        setLoading(true);
        try {
            await api.placeBid(auction.id, bidAmount);
            showNotification({
                message: `Successfully bid ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(bidAmount)}!`,
                type: 'success'
            });
            onUpdate();
        } catch (error: any) {
            showNotification({ message: error.message || 'Failed to place bid', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleBuyout = async () => {
        if (!confirm(`Are you sure you want to buy out this player for ${new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(auction.buyoutPrice)}?`)) {
            return;
        }

        setLoading(true);
        try {
            await api.buyoutAuction(auction.id);
            showNotification({ message: 'Player successfully acquired!', type: 'success' });
            onUpdate();
            onClose();
        } catch (error: any) {
            showNotification({ message: error.message || 'Failed to complete buyout', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={onClose} />

            {/* Dialog Content */}
            <div className="relative w-full max-w-4xl bg-white dark:bg-emerald-950 border-2 border-emerald-500/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">

                {/* Left Side: Player Info & Stats */}
                <div className="flex-1 p-8 border-b md:border-b-0 md:border-r border-emerald-500/10 overflow-y-auto">
                    <button onClick={onClose} className="absolute top-4 left-4 p-2 rounded-full hover:bg-slate-100 dark:hover:bg-emerald-900/30 transition-colors md:hidden">
                        <X size={20} />
                    </button>

                    <div className="flex items-center gap-6 mb-8 mt-4 md:mt-0">
                        <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/20 rounded-2xl flex items-center justify-center p-2">
                            <MiniPlayer
                                appearance={auction.player.appearance || generateAppearance(auction.player.id)}
                                position={mapPosition(auction.player.position)}
                                size={80}
                            />
                        </div>
                        <div>
                            <h2 className="text-3xl font-black italic text-emerald-900 dark:text-white uppercase leading-none mb-2">
                                {auction.player.name}
                            </h2>
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-xs font-black italic">
                                    {auction.player.position}
                                </span>
                                <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest">
                                    Overall {auction.player.overall}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-8">
                        <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-100 dark:border-emerald-900/20">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Age</div>
                            <div className="text-xl font-black italic text-slate-900 dark:text-white">{auction.player.age}</div>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-black/20 rounded-2xl border border-slate-100 dark:border-emerald-900/20">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</div>
                            <div className="text-xl font-black italic text-emerald-500">{auction.status}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="font-black italic text-slate-500 text-xs uppercase tracking-widest">Key Attributes</h3>
                        {/* Simplified Stats Mockup */}
                        <div className="space-y-3">
                            {['Pace', 'Passing', 'Dribbling', 'Defending', 'Physical'].map(stat => (
                                <div key={stat} className="flex items-center justify-between group">
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">{stat}</span>
                                    <div className="flex items-center gap-3 flex-1 ml-6">
                                        <div className="h-1.5 flex-1 bg-slate-100 dark:bg-emerald-900/30 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                                                style={{ width: `${Math.floor(Math.random() * 40) + 60}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-black italic text-emerald-600">84</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Side: Auction Controls */}
                <div className="w-full md:w-[360px] p-8 bg-emerald-50/30 dark:bg-black/40 flex flex-col">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="font-black italic text-emerald-900 dark:text-white uppercase tracking-tighter text-xl">
                            AUCTION HUB
                        </h3>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-emerald-900/30 transition-colors hidden md:block">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6 mb-auto">
                        <div className="p-5 bg-white dark:bg-emerald-900/20 rounded-2xl border-2 border-emerald-500/20 shadow-sm">
                            <div className="flex justify-between items-start mb-1">
                                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Price</div>
                                <div className="text-[10px] font-bold text-emerald-500 uppercase flex items-center gap-1">
                                    <Clock size={10} />
                                    {auction.status === 'ACTIVE' ? timeLeft : 'CLOSED'}
                                </div>
                            </div>
                            <div className="text-3xl font-black italic text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(auction.currentPrice)}
                            </div>
                            {auction.currentBidder && (
                                <div className="mt-2 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                    <ArrowUpRight size={12} className="text-emerald-500" />
                                    Winning: {auction.currentBidder.name}
                                </div>
                            )}
                            {auction.endsAt && auction.status !== 'ACTIVE' && (
                                <div className="mt-1 text-[9px] text-slate-500 font-bold uppercase">
                                    Closed At: {new Date(auction.endsAt).toLocaleString()}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Your Bid Amount</label>
                            <div className="relative">
                                <DollarSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="number"
                                    value={bidAmount}
                                    onChange={(e) => setBidAmount(parseInt(e.target.value))}
                                    className="w-full pl-12 pr-4 py-4 bg-white dark:bg-black/20 border-2 border-emerald-500/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-black text-xl italic"
                                />
                            </div>
                            <div className="flex gap-2">
                                {[500000, 1000000, 5000000].map(val => (
                                    <button
                                        key={val}
                                        onClick={() => setBidAmount(prev => prev + val)}
                                        className="flex-1 py-2 bg-emerald-500/10 text-emerald-600 text-[10px] font-black italic rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-all"
                                    >
                                        +{val / 1000000}M
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4 pt-8 border-t border-emerald-500/10">
                        <button
                            onClick={handleBid}
                            disabled={loading || auction.status !== 'ACTIVE'}
                            className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black italic tracking-tight text-lg shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 group disabled:opacity-50 disabled:grayscale"
                        >
                            {loading ? <Loader2 size={24} className="animate-spin" /> : (
                                <>
                                    <Gavel size={24} className="group-hover:rotate-12 transition-transform" />
                                    PLACE BID
                                </>
                            )}
                        </button>

                        <button
                            onClick={handleBuyout}
                            disabled={loading || auction.status !== 'ACTIVE'}
                            className="w-full py-4 bg-emerald-900 hover:bg-black text-white rounded-2xl font-black italic tracking-tight text-lg shadow-lg active:scale-95 transition-all flex flex-col items-center justify-center group disabled:opacity-50"
                        >
                            <div className="flex items-center gap-2 group-hover:text-emerald-400 transition-colors">
                                <Zap size={18} fill="currentColor" />
                                INSTANT BUYOUT
                            </div>
                            <span className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest -mt-1">
                                {formatCurrency(auction.buyoutPrice)}
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
