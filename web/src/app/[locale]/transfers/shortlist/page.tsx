"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MyBid, type TransferAuction, type TransferTransaction } from "@/lib/api";

type TabType = "buying" | "selling";

export default function ShortlistPage() {
  const { user, team } = useAuth();
  const params = useParams();
  const locale = params.locale as string;
  const [activeTab, setActiveTab] = useState<TabType>("buying");
  type EnrichedBid = MyBid & { highestBid: number; isHighestBidder: boolean; competitorBid?: number; competitorTeam?: string };
  const [bids, setBids] = useState<EnrichedBid[]>([]);
  const [listings, setListings] = useState<TransferAuction[]>([]);
  const [purchases, setPurchases] = useState<TransferTransaction[]>([]);
  const [sales, setSales] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setPurchases(purchasesData.items);
      setSales(salesData.items);
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

  const formatCurrency = (value: number) => `€${value.toLocaleString()}`;

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
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}H ${minutes}M`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActiveBids = () => bids.filter((b) => b.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-[#00110c]">
      {/* Header */}
      <header className="bg-[#001e17]/60 backdrop-blur-2xl border-b border-[#2f4e44]/10">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black text-[#00FF9C] tracking-tighter uppercase">
                {team?.name || "Your Club"}
              </h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-[#91b2a6] font-bold mt-1">
                Transfer Shortlist
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6 bg-[#00251c] p-1.5 rounded-full w-fit">
            <button
              onClick={() => setActiveTab("buying")}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "buying"
                  ? "bg-[#a1ffc2] text-[#00643a]"
                  : "text-[#91b2a6] hover:text-[#d3f5e8]"
              }`}
            >
              Buying
            </button>
            <button
              onClick={() => setActiveTab("selling")}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "selling"
                  ? "bg-[#a1ffc2] text-[#00643a]"
                  : "text-[#91b2a6] hover:text-[#d3f5e8]"
              }`}
            >
              Selling
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="w-full max-w-6xl mx-auto px-8 py-8">
        {activeTab === "buying" ? (
          <div className="space-y-8">
            {/* Active Bids */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs uppercase tracking-[0.2em] text-[#91b2a6] font-bold">
                  Active Bids ({getActiveBids().length})
                </h2>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 bg-[#00251c] rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : getActiveBids().length === 0 ? (
                <div className="text-center py-12 text-[#91b2a6] text-sm">
                  No active bids
                </div>
              ) : (
                <div className="space-y-3">
                  {getActiveBids().map((bid) => (
                    <div
                      key={bid.id}
                      className="flex items-center justify-between p-4 bg-[#00251c] rounded-xl border border-[#2f4e44]/10 hover:border-[#a1ffc2]/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#002c22] rounded-xl flex items-center justify-center text-lg font-bold text-[#a1ffc2]">
                          {bid.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${locale}/players/${bid.player.id}`}
                            className="text-sm font-bold text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors"
                          >
                            {bid.player.name}
                          </Link>
                          <p className="text-[10px] text-[#91b2a6]">
                            {bid.player.age}y • {bid.player.position} • {bid.team?.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-[#91b2a6] mb-1">Current Bid</p>
                          <p className="text-lg font-bold text-[#d3f5e8]">
                            {formatCurrency(bid.currentPrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                              bid.isHighestBidder
                                ? "bg-[#00FF9C]/10 text-[#00FF9C] border border-[#00FF9C]/20"
                                : "bg-[#ff716c]/10 text-[#ff716c] border border-[#ff716c]/20"
                            }`}
                          >
                            {bid.isHighestBidder ? "Highest" : "Outbid"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Purchases */}
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-[#91b2a6] font-bold mb-4">
                Purchases ({purchases.length})
              </h2>
              {purchases.length === 0 ? (
                <div className="text-center py-8 text-[#91b2a6] text-sm">No purchases yet</div>
              ) : (
                <div className="space-y-3">
                  {purchases.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-[#00251c] rounded-xl border border-[#2f4e44]/10 opacity-70"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#002c22] rounded-xl flex items-center justify-center text-lg font-bold text-[#a1ffc2] grayscale">
                          {tx.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${locale}/players/${tx.player.id}`}
                            className="text-sm font-bold text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors"
                          >
                            {tx.player.name}
                          </Link>
                          <p className="text-[10px] text-[#91b2a6]">
                            {tx.player.age}y • {tx.player.position} • From {tx.fromTeam?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[#a1ffc2]">
                          {formatCurrency(tx.amount)}
                        </p>
                        <p className="text-[10px] text-[#91b2a6]">S{tx.season}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Active Listings */}
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-[#91b2a6] font-bold mb-4">
                Active Listings ({listings.length})
              </h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 bg-[#00251c] rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-12 text-[#91b2a6] text-sm">
                  No active listings
                </div>
              ) : (
                <div className="space-y-3">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="flex items-center justify-between p-4 bg-[#00251c] rounded-xl border border-[#2f4e44]/10 hover:border-[#a1ffc2]/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#002c22] rounded-xl flex items-center justify-center text-lg font-bold text-[#a1ffc2]">
                          {listing.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${locale}/players/${listing.player.id}`}
                            className="text-sm font-bold text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors"
                          >
                            {listing.player.name}
                          </Link>
                          <p className="text-[10px] text-[#91b2a6]">
                            {listing.player.age}y • {listing.player.position}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-[#91b2a6] mb-1">Current Bid</p>
                          <p className="text-lg font-bold text-[#a1ffc2]">
                            {formatCurrency(listing.currentPrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-[#91b2a6]">
                            {listing.bidHistory.length} bids
                          </p>
                          <p className="text-[10px] text-[#91b2a6]">
                            Ends {formatTimeRemaining(listing.expiresAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Sales */}
            <section>
              <h2 className="text-xs uppercase tracking-[0.2em] text-[#91b2a6] font-bold mb-4">
                Sales ({sales.length})
              </h2>
              {sales.length === 0 ? (
                <div className="text-center py-8 text-[#91b2a6] text-sm">No sales yet</div>
              ) : (
                <div className="space-y-3">
                  {sales.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-[#00251c] rounded-xl border border-[#2f4e44]/10 opacity-70"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#002c22] rounded-xl flex items-center justify-center text-lg font-bold text-[#a1ffc2] grayscale">
                          {tx.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${locale}/players/${tx.player.id}`}
                            className="text-sm font-bold text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors"
                          >
                            {tx.player.name}
                          </Link>
                          <p className="text-[10px] text-[#91b2a6]">
                            {tx.player.age}y • {tx.player.position} • To {tx.toTeam?.name}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-[#d3f5e8]">
                          {formatCurrency(tx.amount)}
                        </p>
                        <p className="text-[10px] text-[#91b2a6]">S{tx.season}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
