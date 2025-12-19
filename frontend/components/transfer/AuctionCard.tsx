'use client';

import { useEffect, useState } from 'react';
import { Auction } from '@/lib/api';
import { MiniPlayer } from '@/components/MiniPlayer';
import { generateAppearance, mapPosition } from '@/utils/playerUtils';
import { DollarSign, Clock, TrendingUp, User, Shield, Briefcase } from 'lucide-react';
import { clsx } from 'clsx';

interface AuctionCardProps {
    auction: Auction;
    isOwnListing?: boolean;
    isWinning?: boolean;
}

export function AuctionCard({ auction, isOwnListing, isWinning }: AuctionCardProps) {
    const [timeLeft, setTimeLeft] = useState<string>('');

    useEffect(() => {
        const updateTimer = () => {
            const ends = new Date(auction.expiresAt).getTime();
            const now = new Date().getTime();
            const diff = ends - now;

            if (diff <= 0) {
                setTimeLeft('ENDED');
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            if (hours > 0) {
                setTimeLeft(`${hours}h ${minutes}m`);
            } else if (minutes > 0) {
                setTimeLeft(`${minutes}m ${seconds}s`);
            } else {
                setTimeLeft(`${seconds}s`);
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [auction.expiresAt]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const isUrgent = timeLeft.includes('s') && !timeLeft.includes('m') && timeLeft !== 'ENDED';

    return (
        <div className={clsx(
            "group relative flex flex-col bg-white dark:bg-black/20 rounded-2xl border-2 transition-all hover:translate-y-[-4px]",
            isWinning
                ? "border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                : isOwnListing
                    ? "border-blue-500/50 shadow-lg shadow-blue-500/10"
                    : "border-slate-200 dark:border-emerald-900/20 grayscale hover:grayscale-0"
        )}>
            {/* Badge Overlay */}
            {(isWinning || isOwnListing) && (
                <div className={clsx(
                    "absolute top-3 left-3 z-10 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter flex items-center gap-1 shadow-sm",
                    isWinning ? "bg-emerald-500 text-white" : "bg-blue-500 text-white"
                )}>
                    {isWinning ? <TrendingUp size={10} /> : <Briefcase size={10} />}
                    {isWinning ? 'WINNING' : 'YOUR LISTING'}
                </div>
            )}

            {/* Player Visual Area */}
            <div className="relative h-48 rounded-t-xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 dark:from-emerald-950/40 dark:to-emerald-900/20 flex items-center justify-center pt-8">
                <div className="absolute top-3 right-3 text-[10px] font-bold text-slate-400 italic">
                    {auction.team.name.toUpperCase()}
                </div>

                <MiniPlayer
                    appearance={auction.player.appearance || generateAppearance(auction.player.id)}
                    position={mapPosition(auction.player.position)}
                    size={96}
                />

                {/* Rating Badge */}
                <div className="absolute -bottom-2 right-4 w-12 h-12 bg-white dark:bg-emerald-500 rounded-xl border-2 border-emerald-600 dark:border-emerald-400 shadow-xl flex flex-col items-center justify-center transform rotate-3">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-100 uppercase leading-none">OVR</span>
                    <span className="text-xl font-black italic text-emerald-900 dark:text-white">{auction.player.overall}</span>
                </div>

                {/* Position Badge */}
                <div className="absolute -bottom-2 left-4 px-3 py-1 bg-slate-900 text-white rounded-lg shadow-lg flex items-center gap-1.5 transform -rotate-3">
                    <Shield size={10} className="text-slate-400" />
                    <span className="text-xs font-black italic">{auction.player.position}</span>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-5 pt-7 flex-1 flex flex-col">
                <h3 className="text-lg font-black italic tracking-tight text-slate-900 dark:text-white uppercase line-clamp-1 mb-1">
                    {auction.player.name}
                </h3>
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                    <span>{auction.player.age} Years Old</span>
                    <span className="w-1 h-1 rounded-full bg-slate-300" />
                    <span>{auction.player.isGoalkeeper ? 'Goalie' : 'Outfield'}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">Current Price</div>
                        <div className="text-lg font-black italic text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(auction.currentPrice)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">
                            {auction.status === 'ACTIVE' ? 'Expires In' : 'Closed At'}
                        </div>
                        <div className={clsx(
                            "text-lg font-black italic flex items-center gap-1",
                            auction.status === 'ACTIVE' && isUrgent ? "text-rose-500 animate-pulse" : "text-slate-900 dark:text-white"
                        )}>
                            <Clock size={16} />
                            {auction.status === 'ACTIVE' ? timeLeft : auction.endsAt ? new Date(auction.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'ENDED'}
                        </div>
                    </div>
                </div>

                <button
                    disabled={isOwnListing || timeLeft === 'ENDED'}
                    className={clsx(
                        "w-full py-2.5 rounded-xl font-black italic tracking-tight text-sm flex items-center justify-center gap-2 transition-all",
                        isOwnListing
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                            : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 active:scale-95"
                    )}
                >
                    {timeLeft === 'ENDED' ? 'AUCTION ENDED' : (isOwnListing ? 'YOUR AUCTION' : 'PLACE BID')}
                </button>
            </div>
        </div>
    );
}
