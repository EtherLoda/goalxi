"use client";

import Link from "next/link";
import { type TransferAuction, type MyBid } from "@/lib/api";

interface TransferCardProps {
  auction: TransferAuction | MyBid;
  isSelected?: boolean;
  onClick?: () => void;
  showBidStatus?: boolean;
  competitorBid?: number;
  competitorTeam?: string;
  formatCurrency: (value: number) => string;
  formatTimeRemaining: (expiresAt: string) => string;
}

export default function TransferCard({
  auction,
  isSelected = false,
  onClick,
  showBidStatus = false,
  competitorBid,
  competitorTeam,
  formatCurrency,
  formatTimeRemaining,
}: TransferCardProps) {
  const isMyBid = "isLeading" in auction;
  const player = auction.player;
  const initials = player.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const timeLeft = formatTimeRemaining(auction.expiresAt);
  const isExpired = timeLeft === "Expired";

  const currentPrice = isMyBid && auction.bidHistory.length > 0
    ? auction.bidHistory[auction.bidHistory.length - 1].amount
    : auction.currentPrice;

  return (
    <div
      onClick={onClick}
      className={`glass-panel group flex items-center hover:bg-[#003328] transition-all p-5 rounded-2xl border cursor-pointer ${
        isSelected
          ? "border-[#a1ffc2] ring-1 ring-[#a1ffc2]/30"
          : "border-outline-variant/10 hover:border-outline-variant/20"
      }`}
    >
      {/* Left: Avatar & Info */}
      <div className="flex items-center gap-5 w-1/3">
        <div className="relative">
          <div className="w-14 h-14 rounded-xl bg-surface-container-high flex items-center justify-center border border-outline-variant/20 shadow-lg overflow-hidden">
            <span className="text-2xl text-[#d3f5e8]">{initials}</span>
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-surface-container rounded-lg p-1 border border-outline-variant/30 flex items-center justify-center">
            <span className="text-[8px] font-bold text-[#d3f5e8]">
              {player.nationality?.substring(0, 2) || "XX"}
            </span>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <Link href={`/players/${player.id}`} className="hover:text-[#a1ffc2] transition-colors">
              <h4 className="font-headline font-bold text-lg text-[#d3f5e8] leading-tight">
                {player.name}
              </h4>
            </Link>
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant font-bold">
              <span className="material-symbols-outlined text-xs">schedule</span>
              {timeLeft}
            </div>
          </div>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest mt-0.5">
            {player.age}y • {player.position} •{" "}
            {auction.team?.name?.toUpperCase() || "UNKNOWN"}
          </p>
        </div>
      </div>

      {/* Center: Prices */}
      <div className="flex flex-1 items-center justify-between px-10">
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">
              Current Price
            </p>
            <p
              className={`font-headline font-black text-2xl ${
                isMyBid && !auction.isLeading ? "text-[#d3f5e8]" : "text-[#00FF9C]"
              } tracking-tight`}
            >
              {formatCurrency(currentPrice)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase text-on-surface-variant font-bold mb-1">
              Buyout
            </p>
            <p className="font-headline font-black text-xl text-[#91b2a6] tracking-tight">
              {formatCurrency(auction.buyoutPrice)}
            </p>
          </div>
        </div>

        {/* Right: Bid Status */}
        {showBidStatus && isMyBid && (
          <div className="flex flex-col items-end gap-2">
            {auction.isLeading ? (
              <span className="bg-[#00FF9C]/10 text-[#00FF9C] px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border border-[#00FF9C]/20 shadow-[0_0_15px_rgba(0,255,156,0.1)]">
                Highest Bidder
              </span>
            ) : (
              <span className="bg-error/10 text-error px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] flex items-center gap-2 border border-error/20">
                <span className="material-symbols-outlined text-xs">warning</span>
                Outbid
              </span>
            )}
            {competitorBid && competitorTeam && (
              <p className="text-[10px] text-error font-black uppercase tracking-widest">
                {competitorTeam} bid {formatCurrency(competitorBid)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
