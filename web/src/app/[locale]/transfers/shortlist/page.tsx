"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { api, type MyBid, type TransferAuction, type TransferTransaction } from "@/lib/api";

type TabType = "buying" | "selling";

export default function ShortlistPage() {
  const t = useTranslations();
  const { team } = useAuth();
  const params = useParams();
  const localeParam = params.locale as string;
  const [activeTab, setActiveTab] = useState<TabType>("buying");
  type EnrichedBid = MyBid & { highestBid: number; isHighestBidder: boolean; competitorBid?: number; competitorTeam?: string };
  const [bids, setBids] = useState<EnrichedBid[]>([]);
  const [listings, setListings] = useState<TransferAuction[]>([]);
  const [purchases, setPurchases] = useState<TransferTransaction[]>([]);
  const [sales, setSales] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!team) return;
    setIsLoading(true);
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
      console.error(t("shortlist.failedToLoad"), err);
    } finally {
      setIsLoading(false);
    }
  }, [team, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (value: number) => `${t("common.currencySymbol")}${value.toLocaleString()}`;

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    if (diff <= 0) return t("shortlist.expired");
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 48) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    return `${hours}H ${minutes}M`;
  };

  const getActiveBids = () => bids.filter((b) => b.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-surface-container-lowest">
      {/* Header */}
      <header className="bg-surface-container-low/60 backdrop-blur-2xl border-b border-outline-variant/10">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black text-jade tracking-tighter uppercase">
                {team?.name || t("shortlist.yourClub")}
              </h1>
              <p className="text-kicker uppercase tracking-[0.3em] text-on-surface-variant font-bold mt-1">
                {t("shortlist.subtitle")}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6 bg-surface-container p-1.5 rounded-full w-fit">
            <button
              onClick={() => setActiveTab("buying")}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "buying"
                  ? "bg-accent text-inverse-primary"
                  : "text-on-surface-variant hover:text-frost"
              }`}
            >
              {t("shortlist.tabs.buying")}
            </button>
            <button
              onClick={() => setActiveTab("selling")}
              className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${
                activeTab === "selling"
                  ? "bg-accent text-inverse-primary"
                  : "text-on-surface-variant hover:text-frost"
              }`}
            >
              {t("shortlist.tabs.selling")}
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
                <h2 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold">
                  {t("shortlist.activeBids", { count: getActiveBids().length })}
                </h2>
              </div>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : getActiveBids().length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant text-sm">
                  {t("shortlist.noBids")}
                </div>
              ) : (
                <div className="space-y-3">
                  {getActiveBids().map((bid) => (
                    <div
                      key={bid.id}
                      className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-accent/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-lg font-bold text-accent">
                          {bid.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${localeParam}/players/${bid.player.id}`}
                            className="text-sm font-bold text-frost hover:text-accent transition-colors"
                          >
                            {bid.player.name}
                          </Link>
                          <p className="text-kicker text-on-surface-variant">
                            {bid.player.age}y • {bid.player.position} • {bid.team?.name}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-on-surface-variant mb-1">{t("shortlist.currentBid")}</p>
                          <p className="text-lg font-bold text-frost">
                            {formatCurrency(bid.currentPrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-kicker font-bold uppercase ${
                              bid.isHighestBidder
                                ? "bg-jade/10 text-jade border border-jade/20"
                                : "bg-danger-soft/10 text-danger-soft border border-danger-soft/20"
                            }`}
                          >
                            {bid.isHighestBidder ? t("shortlist.highest") : t("shortlist.outbid")}
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
              <h2 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-4">
                {t("shortlist.purchases", { count: purchases.length })}
              </h2>
              {purchases.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-sm">{t("shortlist.noPurchases")}</div>
              ) : (
                <div className="space-y-3">
                  {purchases.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10 opacity-70"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-lg font-bold text-accent grayscale">
                          {tx.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${localeParam}/players/${tx.player.id}`}
                            className="text-sm font-bold text-frost hover:text-accent transition-colors"
                          >
                            {tx.player.name}
                          </Link>
                          <p className="text-kicker text-on-surface-variant">
                            {tx.player.age}y • {tx.player.position} • {t("shortlist.from", { team: tx.fromTeam?.name || "" })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-accent">
                          {formatCurrency(tx.amount)}
                        </p>
                        <p className="text-kicker text-on-surface-variant">{t("shortlist.season", { season: tx.season })}</p>
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
              <h2 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-4">
                {t("shortlist.activeListings", { count: listings.length })}
              </h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-20 bg-surface-container rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : listings.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant text-sm">
                  {t("shortlist.noListings")}
                </div>
              ) : (
                <div className="space-y-3">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10 hover:border-accent/20 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-lg font-bold text-accent">
                          {listing.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${localeParam}/players/${listing.player.id}`}
                            className="text-sm font-bold text-frost hover:text-accent transition-colors"
                          >
                            {listing.player.name}
                          </Link>
                          <p className="text-kicker text-on-surface-variant">
                            {listing.player.age}y • {listing.player.position}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-on-surface-variant mb-1">{t("shortlist.currentBid")}</p>
                          <p className="text-lg font-bold text-accent">
                            {formatCurrency(listing.currentPrice)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-kicker text-on-surface-variant">
                            {t("shortlist.bidsCount", { count: listing.bidHistory.length })}
                          </p>
                          <p className="text-kicker text-on-surface-variant">
                            {t("shortlist.ends", { time: formatTimeRemaining(listing.expiresAt) })}
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
              <h2 className="text-xs uppercase tracking-[0.2em] text-on-surface-variant font-bold mb-4">
                {t("shortlist.sales", { count: sales.length })}
              </h2>
              {sales.length === 0 ? (
                <div className="text-center py-8 text-on-surface-variant text-sm">{t("shortlist.noSales")}</div>
              ) : (
                <div className="space-y-3">
                  {sales.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-4 bg-surface-container rounded-xl border border-outline-variant/10 opacity-70"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-surface-container-high rounded-xl flex items-center justify-center text-lg font-bold text-accent grayscale">
                          {tx.player.name.charAt(0)}
                        </div>
                        <div>
                          <Link
                            href={`/${localeParam}/players/${tx.player.id}`}
                            className="text-sm font-bold text-frost hover:text-accent transition-colors"
                          >
                            {tx.player.name}
                          </Link>
                          <p className="text-kicker text-on-surface-variant">
                            {tx.player.age}y • {tx.player.position} • {t("shortlist.to", { team: tx.toTeam?.name || "" })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-frost">
                          {formatCurrency(tx.amount)}
                        </p>
                        <p className="text-kicker text-on-surface-variant">{t("shortlist.season", { season: tx.season })}</p>
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
