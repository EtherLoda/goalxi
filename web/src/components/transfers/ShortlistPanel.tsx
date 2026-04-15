"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type MyBid,
  type TransferAuction,
  type TransferTransaction,
} from "@/lib/api";
import TransferPlayerCard from "./TransferPlayerCard";
import TransferTransactionCard from "./TransferTransactionCard";

type TabType = "buying" | "selling";

interface ShortlistPanelProps {
  teamId: string;
  userId: string;
}

export default function ShortlistPanel({
  teamId,
  userId,
}: ShortlistPanelProps) {
  const { team } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("buying");
  const [bids, setBids] = useState<MyBid[]>([]);
  const [listings, setListings] = useState<TransferAuction[]>([]);
  const [purchases, setPurchases] = useState<TransferTransaction[]>([]);
  const [sales, setSales] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!team) return;
    setIsLoading(true);
    try {
      const [bidsData, listingsData, purchasesData, salesData] =
        await Promise.all([
          api.transfers.getMyBids(),
          api.transfers.getMyListings(),
          api.transfers.getMyPurchases(),
          api.transfers.getMySales(),
        ]);
      setBids(bidsData);
      setListings(listingsData);
      setPurchases(purchasesData.items);
      setSales(salesData.items);
    } catch (err) {
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

  const getActiveBids = () => bids.filter((b) => b.status === "ACTIVE");

  const renderEmptyState = (message: string) => (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="material-symbols-outlined text-4xl text-[#2f4e44] mb-3">
        inbox
      </span>
      <p className="text-[#91b2a6] text-sm">{message}</p>
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto px-8 py-8">
      {/* Tabs */}
      <div className="flex gap-2 bg-[#00251c] p-1.5 rounded-full w-fit mb-8">
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

      {activeTab === "buying" ? (
        <div className="space-y-8">
          {/* Active Bids */}
          <section>
            <h2 className="text-xs uppercase tracking-[0.2em] text-[#91b2a6] font-bold mb-4">
              Active Bids ({getActiveBids().length})
            </h2>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 bg-[#00251c] rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : getActiveBids().length === 0 ? (
              renderEmptyState("No active bids")
            ) : (
              <div className="space-y-3">
                {getActiveBids().map((bid) => (
                  <TransferPlayerCard
                    key={bid.id}
                    transfer={bid}
                    formatCurrency={formatCurrency}
                    formatTimeRemaining={formatTimeRemaining}
                    bidStatus={bid.isLeading ? "leading" : "outbid"}
                  />
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
              renderEmptyState("No purchases yet")
            ) : (
              <div className="space-y-3">
                {purchases.map((tx) => (
                  <TransferTransactionCard
                    key={tx.id}
                    transaction={tx}
                    formatCurrency={formatCurrency}
                    isSale={false}
                    status={tx.status === "COMPLETED" ? "success" : "failed"}
                  />
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
                  <div
                    key={i}
                    className="h-20 bg-[#00251c] rounded-xl animate-pulse"
                  />
                ))}
              </div>
            ) : listings.length === 0 ? (
              renderEmptyState("No active listings")
            ) : (
              <div className="space-y-3">
                {listings.map((listing) => (
                  <TransferPlayerCard
                    key={listing.id}
                    transfer={listing}
                    formatCurrency={formatCurrency}
                    formatTimeRemaining={formatTimeRemaining}
                    bidStatus={undefined}
                  />
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
              renderEmptyState("No sales yet")
            ) : (
              <div className="space-y-3">
                {sales.map((tx) => (
                  <TransferTransactionCard
                    key={tx.id}
                    transaction={tx}
                    formatCurrency={formatCurrency}
                    isSale={true}
                    status={tx.status === "COMPLETED" ? "success" : "failed"}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
