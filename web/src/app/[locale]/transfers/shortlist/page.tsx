"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MyBid, type TransferAuction, type TransferTransaction } from "@/lib/api";

type TabType = "buying" | "selling";

export default function ShortlistPage() {
  const { user, team } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("buying");
  type EnrichedBid = MyBid & { highestBid: number; isHighestBidder: boolean; competitorBid?: number; competitorTeam?: string };
  const [bids, setBids] = useState<EnrichedBid[]>([]);
  const [listings, setListings] = useState<TransferAuction[]>([]);
  const [purchases, setPurchases] = useState<TransferTransaction[]>([]);
  const [sales, setSales] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budget] = useState<number>(142500000);
  const [startingBudget] = useState<number>(215000000);

  const fetchData = useCallback(async () => {
    if (!team) return;
    setIsLoading(true);
    setError(null);
    try {
      const [bidsData, listingsData, purchasesData, salesData] = await Promise.all([
        api.transfers.getMyBids(),
        api.transfers.getMyListings(),
        api.transfers.getMyPurchases(),
        api.transfers.getMySales(),
      ]);

      // Enrich bids with competitor info
      type EnrichedBid = MyBid & { highestBid: number; isHighestBidder: boolean; competitorBid?: number; competitorTeam?: string };
      const enrichedBids: EnrichedBid[] = bidsData.map((bid) => {
        const lastBid = bid.bidHistory.length > 0
          ? bid.bidHistory[bid.bidHistory.length - 1]
          : null;
        return {
          ...bid,
          highestBid: bid.currentPrice,
          isHighestBidder: bid.isLeading,
          competitorBid: !bid.isLeading && lastBid && lastBid.teamId !== team.id
            ? lastBid.amount
            : undefined,
          competitorTeam: !bid.isLeading && lastBid && lastBid.teamId !== team.id
            ? lastBid.teamName
            : undefined,
        };
      });

      setBids(enrichedBids);
      setListings(listingsData);
      setPurchases(purchasesData);
      setSales(salesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Failed to fetch shortlist data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [team]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (value: number) => {
    return `€${value.toLocaleString()}`;
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours >= 48) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours >= 24) {
      return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    }
    return `${hours}H ${minutes}M`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getActiveBids = () => bids.filter(b => b.status === 'ACTIVE');

  const budgetUsed = startingBudget - budget;
  const budgetPercent = (budgetUsed / startingBudget) * 100;

  const renderPlayerRow = (bid: EnrichedBid, isOutbid: boolean = false) => (
    <div className="glass-panel group flex items-center hover:bg-[#003328] transition-all p-5 rounded-2xl border border-outline-variant/10">
      <div className="flex items-center gap-5 w-1/3">
        <div className="relative">
          <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 shadow-lg overflow-hidden">
            <span className="text-2xl">{bid.player.name.charAt(0)}</span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-surface-container rounded-lg p-1 border border-outline-variant/30 flex items-center justify-center">
            <span className="text-[8px] font-bold">{bid.player.nationality?.substring(0, 2) || 'XX'}</span>
          </div>
        </div>
        <div>
          <h4 className="font-headline font-bold text-lg text-[#d3f5e8] leading-tight">{bid.player.name}</h4>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
            {bid.player.age}y • {bid.player.position} • {bid.team?.name?.toUpperCase() || 'UNKNOWN'}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-between px-10">
        <div className="text-center">
          <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">
            {isOutbid ? 'Your Bid' : 'Current Bid'}
          </p>
          <p className={`font-headline font-black text-2xl ${isOutbid ? 'text-[#d3f5e8]' : 'text-primary'} tracking-tight`}>
            {formatCurrency(bid.bidHistory.length > 0 ? bid.bidHistory[bid.bidHistory.length - 1].amount : bid.startPrice)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {bid.isHighestBidder ? (
            <span className="bg-[#00FF9C]/10 text-[#00FF9C] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border border-[#00FF9C]/20 shadow-[0_0_15px_rgba(0,255,156,0.1)]">
              Highest Bidder
            </span>
          ) : (
            <span className="bg-error/10 text-error px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border border-error/20">
              <span className="material-symbols-outlined text-xs">warning</span>
              Outbid
            </span>
          )}
          {bid.competitorBid && (
            <p className="text-[10px] text-error font-black uppercase tracking-widest">
              {bid.competitorTeam} bid {formatCurrency(bid.competitorBid)}
            </p>
          )}
          <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-bold">
            <span className="material-symbols-outlined text-xs">schedule</span>
            ENDS IN {formatTimeRemaining(bid.expiresAt)}
          </div>
        </div>
      </div>
    </div>
  );

  const renderPurchaseRow = (tx: TransferTransaction) => (
    <div className="glass-panel group flex items-center p-5 rounded-2xl border border-outline-variant/5 bg-surface-container/20">
      <div className="flex items-center gap-5 w-1/3 opacity-80">
        <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 grayscale">
          <span className="text-2xl">{tx.player.name.charAt(0)}</span>
        </div>
        <div>
          <h4 className="font-headline font-bold text-lg text-[#d3f5e8]">{tx.player.name}</h4>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
            {tx.player.age}y • {tx.player.position} • {tx.fromTeam?.name?.toUpperCase() || 'UNKNOWN'}
          </p>
        </div>
      </div>
      <div className="flex flex-1 items-center justify-between px-10">
        <div className="text-center opacity-70">
          <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">Fee</p>
          <p className="font-headline font-black text-2xl text-[#d3f5e8] tracking-tight">{formatCurrency(tx.amount)}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="bg-secondary-container/20 text-secondary px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border border-secondary/20">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            Signed
          </span>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-1">CONTRACT: 4 YRS</p>
        </div>
      </div>
    </div>
  );

  const renderEmptyState = (message: string) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="material-symbols-outlined text-5xl text-[#2f4e44] mb-4">inbox</span>
      <p className="text-[#91b2a6] text-sm">{message}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#00110c]">
      {/* Header */}
      <header className="w-full bg-[#001e17]/60 backdrop-blur-2xl border-b border-outline-variant/10 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-8 py-6 flex flex-col gap-8">
          {/* Club Info & Budget */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 bg-surface-container-highest rounded-2xl flex items-center justify-center p-2 border border-outline-variant/20 shadow-2xl">
                <div className="w-full h-full bg-primary/20 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">🏟️</span>
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-black text-[#00FF9C] tracking-tighter font-headline uppercase leading-none">
                  {team?.name || 'Your Club'}
                </h1>
                <p className="text-[10px] uppercase tracking-[0.3em] text-on-surface-variant font-bold mt-1">
                  First Team Operations • Transfer Window
                </p>
              </div>
            </div>
            <div className="flex items-center gap-12">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-bold mb-1">Remaining Budget</p>
                <p className="font-headline text-3xl font-bold text-[#a1ffc2] tracking-tight">{formatCurrency(budget)}</p>
              </div>
              <div className="flex items-center gap-4">
                <button className="p-3 hover:bg-[#00FF9C]/10 rounded-xl transition-colors border border-outline-variant/10">
                  <span className="material-symbols-outlined text-on-surface">search</span>
                </button>
                <button className="p-3 hover:bg-[#00FF9C]/10 rounded-xl transition-colors border border-outline-variant/10">
                  <span className="material-symbols-outlined text-on-surface">notifications</span>
                </button>
                <div className="w-12 h-12 rounded-full bg-surface-container-high overflow-hidden border-2 border-primary/20">
                  <div className="w-full h-full flex items-center justify-center bg-primary/20">
                    <span className="font-headline font-black text-sm text-primary">
                      {user?.nickname?.charAt(0) || "M"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Toggles and Sub-nav */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2 bg-[#00251c] p-1.5 rounded-2xl border border-outline-variant/10">
              <button
                onClick={() => setActiveTab("buying")}
                className={`px-10 py-2.5 rounded-xl font-headline font-bold text-sm tracking-tight transition-all ${
                  activeTab === "buying"
                    ? "active-pill"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Buying
              </button>
              <button
                onClick={() => setActiveTab("selling")}
                className={`px-10 py-2.5 rounded-xl font-headline font-bold text-sm tracking-tight transition-all ${
                  activeTab === "selling"
                    ? "active-pill"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Selling
              </button>
            </div>
            <nav className="flex gap-10 font-headline text-sm uppercase tracking-widest font-bold">
              <Link className="text-[#00FF9C] border-b-2 border-[#00FF9C] pb-2" href="/transfers/shortlist">Shortlist</Link>
              <Link className="text-[#d3f5e8]/50 hover:text-[#d3f5e8] transition-colors" href="#">Scouting</Link>
              <Link className="text-[#d3f5e8]/50 hover:text-[#d3f5e8] transition-colors" href="/transfers">Transfer Market</Link>
              <Link className="text-[#d3f5e8]/50 hover:text-[#d3f5e8] transition-colors" href="/transfers/history">History</Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Content Canvas */}
      <div className="max-w-[1600px] mx-auto p-8 w-full flex gap-10 flex-1">
        {/* Main List */}
        <div className="flex-1 space-y-10">
          {activeTab === "buying" ? (
            <>
              {/* Section: Ongoing/Unfinalized */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline text-xl font-bold flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-primary-fixed-dim shadow-[0_0_12px_rgba(0,236,144,0.5)]"></span>
                    Ongoing/Unfinalized
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FF9C] bg-[#00FF9C]/10 px-3 py-1 rounded-full border border-[#00FF9C]/20">
                    {getActiveBids().length} Active Bids
                  </span>
                </div>
                <div className="space-y-3">
                  {isLoading ? (
                    [1, 2].map((i) => (
                      <div key={i} className="glass-panel animate-pulse flex items-center p-5 rounded-2xl border border-outline-variant/10">
                        <div className="flex items-center gap-5 w-1/3">
                          <div className="w-14 h-14 rounded-xl bg-surface-container-high" />
                          <div className="space-y-2">
                            <div className="h-5 bg-surface-container-high rounded w-32" />
                            <div className="h-3 bg-surface-container-high rounded w-24" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : getActiveBids().length > 0 ? (
                    getActiveBids().map((bid) => renderPlayerRow(bid, bid.isOutbid))
                  ) : (
                    renderEmptyState("No active bids. Browse the transfer market to find players.")
                  )}
                </div>
              </section>

              {/* Section: Finalized */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline text-xl font-bold flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-outline-variant/30"></span>
                    Finalized
                  </h3>
                </div>
                <div className="space-y-3">
                  {purchases.length > 0 ? (
                    purchases.map((tx) => renderPurchaseRow(tx))
                  ) : (
                    renderEmptyState("No finalized transfers yet.")
                  )}
                </div>
              </section>
            </>
          ) : (
            <>
              {/* Selling Tab */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline text-xl font-bold flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-primary-fixed-dim shadow-[0_0_12px_rgba(0,236,144,0.5)]"></span>
                    Active Listings
                  </h3>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FF9C] bg-[#00FF9C]/10 px-3 py-1 rounded-full border border-[#00FF9C]/20">
                    {listings.length} Players Listed
                  </span>
                </div>
                <div className="space-y-3">
                  {isLoading ? (
                    [1, 2].map((i) => (
                      <div key={i} className="glass-panel animate-pulse flex items-center p-5 rounded-2xl border border-outline-variant/10">
                        <div className="flex items-center gap-5 w-1/3">
                          <div className="w-14 h-14 rounded-xl bg-surface-container-high" />
                          <div className="space-y-2">
                            <div className="h-5 bg-surface-container-high rounded w-32" />
                            <div className="h-3 bg-surface-container-high rounded w-24" />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : listings.length > 0 ? (
                    listings.map((listing) => (
                      <div key={listing.id} className="glass-panel group flex items-center hover:bg-[#003328] transition-all p-5 rounded-2xl border border-outline-variant/10">
                        <div className="flex items-center gap-5 w-1/3">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 shadow-lg">
                              <span className="text-2xl">{listing.player.name.charAt(0)}</span>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-headline font-bold text-lg text-[#d3f5e8] leading-tight">{listing.player.name}</h4>
                            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
                              {listing.player.age}y • {listing.player.position}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 items-center justify-between px-10">
                          <div className="text-center">
                            <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">Current Bid</p>
                            <p className="font-headline font-black text-2xl text-primary tracking-tight">
                              {formatCurrency(listing.currentPrice)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className="bg-[#00FF9C]/10 text-[#00FF9C] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border border-[#00FF9C]/20">
                              {listing.bidHistory.length} Bids
                            </span>
                            <div className="flex items-center gap-2 text-[10px] text-on-surface-variant font-bold">
                              <span className="material-symbols-outlined text-xs">schedule</span>
                              ENDS IN {formatTimeRemaining(listing.expiresAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    renderEmptyState("No active listings. List players from your squad on the transfer market.")
                  )}
                </div>
              </section>

              {/* Finalized Sales */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-headline text-xl font-bold flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-outline-variant/30"></span>
                    Finalized Sales
                  </h3>
                </div>
                <div className="space-y-3">
                  {sales.length > 0 ? (
                    sales.map((tx) => (
                      <div key={tx.id} className="glass-panel group flex items-center p-5 rounded-2xl border border-outline-variant/5 bg-surface-container/20">
                        <div className="flex items-center gap-5 w-1/3 opacity-80">
                          <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 grayscale">
                            <span className="text-2xl">{tx.player.name.charAt(0)}</span>
                          </div>
                          <div>
                            <h4 className="font-headline font-bold text-lg text-[#d3f5e8]">{tx.player.name}</h4>
                            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
                              {tx.player.age}y • {tx.player.position} • {tx.toTeam?.name?.toUpperCase() || 'UNKNOWN'}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-1 items-center justify-between px-10">
                          <div className="text-center opacity-70">
                            <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">Sale Price</p>
                            <p className="font-headline font-black text-2xl text-secondary tracking-tight">{formatCurrency(tx.amount)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className="bg-secondary-container/20 text-secondary px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border border-secondary/20">
                              <span className="material-symbols-outlined text-xs">check_circle</span>
                              Sold
                            </span>
                            <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-1">
                              {tx.settledAt ? formatDate(tx.settledAt) : formatDate(tx.transactionDate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    renderEmptyState("No sales yet.")
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Right Sidebar */}
        <aside className="w-[380px] space-y-8">
          {/* Detailed Financial Status Overview */}
          <div className="glass-panel p-8 rounded-[2rem] border border-primary/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 blur-[80px] -mr-24 -mt-24"></div>
            <h3 className="font-headline text-xs font-black uppercase tracking-[0.25em] text-[#00FF9C] mb-8">Financial Overview</h3>
            <div className="space-y-8 relative z-10">
              <div>
                <p className="text-[10px] uppercase text-on-surface-variant font-black tracking-[0.2em] mb-2">Net Remaining Budget</p>
                <p className="font-headline text-5xl font-black text-[#d3f5e8] tracking-tighter">
                  €{(budget / 1000000).toFixed(1)}
                  <span className="text-2xl text-primary/60 ml-1">M</span>
                </p>
              </div>
              <div className="space-y-4">
                <div className="h-3 w-full bg-[#00251c] rounded-full overflow-hidden flex shadow-inner">
                  <div className="h-full bg-primary shadow-[0_0_15px_rgba(0,255,156,0.6)]" style={{ width: `${Math.min(budgetPercent, 100)}%` }}></div>
                  <div className="h-full bg-secondary shadow-[0_0_15px_rgba(171,248,83,0.6)]" style={{ width: `${Math.max(Math.min(15, 100 - budgetPercent), 0)}%` }}></div>
                </div>
                <div className="flex justify-between text-[10px] font-bold tracking-widest text-on-surface-variant/60">
                  <span>BUDGET UTILIZATION</span>
                  <span>{Math.round(budgetPercent)}% COMMITTED</span>
                </div>
              </div>
              <div className="space-y-5 pt-4">
                <div className="flex justify-between items-center group">
                  <span className="text-on-surface-variant font-bold text-xs flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_8px_rgba(0,255,156,0.4)]"></span>
                    Total Starting Budget
                  </span>
                  <span className="font-headline font-bold text-sm text-[#d3f5e8]">{formatCurrency(startingBudget)}</span>
                </div>
                <div className="flex justify-between items-center group">
                  <span className="text-on-surface-variant font-bold text-xs flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_8px_rgba(171,248,83,0.4)]"></span>
                    Active Bids Committed
                  </span>
                  <span className="font-headline font-bold text-sm text-secondary">-{formatCurrency(budgetUsed)}</span>
                </div>
                <div className="flex justify-between items-center group">
                  <span className="text-on-surface-variant font-bold text-xs flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-error shadow-[0_0_8px_rgba(255,113,108,0.4)]"></span>
                    Projected Wage Impact
                  </span>
                  <span className="font-headline font-bold text-sm text-error">-€8,400,000</span>
                </div>
              </div>
              <div className="pt-6 border-t border-outline-variant/20">
                <div className="flex justify-between items-end mb-4">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00FF9C]">Transfer Strategy Tip</div>
                  <span className="material-symbols-outlined text-primary text-sm">lightbulb</span>
                </div>
                <p className="text-[11px] leading-relaxed text-on-surface-variant/90 italic bg-surface-container-high/40 p-3 rounded-xl border border-primary/5">
                  Focus on high-potential players with room for growth. Consider structuring deals with installments to maximize budget efficiency.
                </p>
              </div>
            </div>
          </div>

          {/* Board Expectations Glass Panel */}
          <div className="bg-surface-container/30 p-6 rounded-2xl border border-outline-variant/10">
            <h4 className="font-headline text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant mb-5">Board Expectations</h4>
            <div className="flex gap-4 items-start mb-6">
              <div className="bg-[#00FF9C]/10 p-2.5 rounded-xl text-primary border border-primary/20">
                <span className="material-symbols-outlined text-xl">trending_up</span>
              </div>
              <p className="text-xs leading-relaxed text-on-surface-variant">
                The board expects a competitive squad this season. Balance youth with experienced players for optimal performance.
              </p>
            </div>
            <div className="flex justify-between items-center bg-surface-container-highest/50 px-4 py-3 rounded-xl border border-outline-variant/10">
              <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Available Budget</span>
              <span className="font-headline text-sm font-black text-primary">{formatCurrency(budget)}</span>
            </div>
          </div>

          <button className="w-full py-4 bg-primary text-on-primary rounded-2xl font-headline font-black uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-3 shadow-[0_8px_24px_rgba(0,236,144,0.2)] hover:translate-y-[-2px] transition-all active:scale-[0.98]">
            <span className="material-symbols-outlined text-lg">send</span>
            Submit All Operations
          </button>
        </aside>
      </div>

      {/* Floating Assistant */}
      <div className="fixed bottom-10 right-10 z-[100]">
        <button className="glass-panel text-[#00FF9C] pl-5 pr-6 py-4 rounded-2xl text-xs font-black shadow-2xl border border-[#00FF9C]/20 flex items-center gap-4 hover:scale-105 transition-all group active:scale-95">
          <div className="relative">
            <span className="material-symbols-outlined text-xl">psychology</span>
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse"></span>
          </div>
          <div className="text-left">
            <p className="uppercase tracking-widest">Negotiation Assistant</p>
            <p className="text-[9px] text-on-surface-variant font-bold">3 INSIGHTS AVAILABLE</p>
          </div>
        </button>
      </div>

      <style jsx>{`
        .glass-panel {
          background: rgba(0, 44, 34, 0.4);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .active-pill {
          background: linear-gradient(135deg, #a1ffc2 0%, #00fc9a 100%);
          color: #004627 !important;
        }
      `}</style>
    </div>
  );
}
