'use client';

import { useEffect, useState } from 'react';
import { api, Auction, FinanceState } from '@/lib/api';
import { useAuth } from '@/components/auth/AuthContext';
import {
    Target,
    Search,
    Filter,
    ArrowUpDown,
    DollarSign,
    Clock,
    ArrowLeft,
    PlusCircle,
    Info
} from 'lucide-react';
import Link from 'next/link';
import { AuctionCard } from '@/components/transfer/AuctionCard';
import { AuctionDetailsDialog } from '@/components/transfer/AuctionDetailsDialog';
import { ListPlayerDialog } from '@/components/transfer/ListPlayerDialog';
import { Skeleton } from '@/components/ui/SkeletonLoader';

export default function TransferPage() {
    const { user } = useAuth();
    const [auctions, setAuctions] = useState<Auction[]>([]);
    const [balance, setBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'my-bids' | 'my-listings'>('all');
    const [selectedAuction, setSelectedAuction] = useState<Auction | null>(null);
    const [isListingOpen, setIsListingOpen] = useState(false);

    useEffect(() => {
        const fetchInitialData = async () => {
            setLoading(true);
            try {
                const [auctionData, financeData] = await Promise.allSettled([
                    api.getAuctions(),
                    api.getFinanceBalance()
                ]);

                if (auctionData.status === 'fulfilled') {
                    setAuctions(auctionData.value);
                }
                if (financeData.status === 'fulfilled') {
                    setBalance(financeData.value.balance);
                }
            } catch (error) {
                console.error('Failed to load transfer data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();

        // Polling for updates every 30 seconds
        const interval = setInterval(async () => {
            try {
                const refreshedAuctions = await api.getAuctions();
                setAuctions(refreshedAuctions);
            } catch (e) {
                console.error('Polling failed', e);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    const refreshData = async () => {
        try {
            const auctionData = await api.getAuctions();
            setAuctions(auctionData);

            // If an auction is selected, update it too
            if (selectedAuction) {
                const updated = auctionData.find(a => a.id === selectedAuction.id);
                if (updated) setSelectedAuction(updated);
            }

            const financeData = await api.getFinanceBalance();
            setBalance(financeData.balance);
        } catch (e) {
            console.error('Refresh failed', e);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            maximumFractionDigits: 0
        }).format(amount);
    };

    const filteredAuctions = auctions.filter(auction => {
        if (!auction.player) return false;
        const matchesSearch = auction.player.name.toLowerCase().includes(searchQuery.toLowerCase());

        if (activeTab === 'my-bids') {
            return matchesSearch && auction.currentBidder?.id === user?.teamId;
        }
        if (activeTab === 'my-listings') {
            return matchesSearch && auction.team?.id === user?.teamId;
        }
        return matchesSearch;
    });

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
                <div>
                    <Link href="/" className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-sm mb-2 hover:translate-x-[-4px] transition-transform">
                        <ArrowLeft size={16} /> BACK TO OFFICE
                    </Link>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center border-2 border-emerald-500/40">
                            <Target size={32} className="text-emerald-500" />
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter text-emerald-900 dark:text-white">
                                TRANSFER MARKET
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 font-medium uppercase tracking-widest text-xs">
                                Global Player Auction House
                            </p>
                        </div>
                    </div>
                </div>

                {/* Transfer Budget Card */}
                <div className="bg-white dark:bg-emerald-950/20 border-2 border-emerald-500/40 p-4 rounded-2xl shadow-xl shadow-emerald-500/5 min-w-[240px]">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Available Budget</span>
                        <DollarSign size={14} className="text-emerald-500" />
                    </div>
                    {loading ? (
                        <Skeleton className="h-8 w-32" />
                    ) : (
                        <div className="text-2xl font-black italic text-emerald-900 dark:text-white">
                            {formatCurrency(balance || 0)}
                        </div>
                    )}
                </div>
            </div>

            {/* Toolbar: Search, Filter, Tabs */}
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                    {/* Tabs */}
                    <div className="flex bg-slate-100 dark:bg-emerald-900/10 p-1 rounded-xl">
                        {(['all', 'my-bids', 'my-listings'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab
                                    ? 'bg-white dark:bg-emerald-500 text-emerald-600 dark:text-white shadow-sm'
                                    : 'text-slate-500 hover:text-emerald-600'
                                    }`}
                            >
                                {tab.replace('-', ' ')}
                            </button>
                        ))}
                    </div>

                </div>

                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search players by name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-black/20 border border-slate-200 dark:border-emerald-900/30 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all font-medium text-sm"
                        />
                    </div>
                </div>
            </div>

            {/* Market Grid */}
            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => (
                        <Skeleton key={i} className="h-[380px] rounded-2xl" />
                    ))}
                </div>
            ) : filteredAuctions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-emerald-900/10 rounded-full flex items-center justify-center mb-4">
                        <Info size={40} className="text-slate-300" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Players Found</h3>
                    <p className="text-slate-500 max-w-xs uppercase text-xs font-bold tracking-widest">
                        There are no active {activeTab === 'all' ? '' : activeTab.replace('-', ' ')} auctions matching your criteria.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredAuctions.map((auction) => (
                        <div key={auction.id} onClick={() => setSelectedAuction(auction)} className="cursor-pointer">
                            <AuctionCard
                                auction={auction}
                                isOwnListing={auction.team?.id === user?.teamId}
                                isWinning={auction.currentBidder?.id === user?.teamId}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* Modals */}
            {selectedAuction && (
                <AuctionDetailsDialog
                    auction={selectedAuction}
                    onClose={() => setSelectedAuction(null)}
                    onUpdate={refreshData}
                />
            )}

            {isListingOpen && (
                <ListPlayerDialog
                    onClose={() => setIsListingOpen(false)}
                    onSuccess={refreshData}
                />
            )}
        </div>
    );
}
