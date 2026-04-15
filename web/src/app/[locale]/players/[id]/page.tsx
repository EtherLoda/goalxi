"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { api, type Player, type TransferAuction } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";

const SKILL_MAX = 20;

const SPECIALTIES: { value: string; label: string; icon: string }[] = [
  { value: "HEADER", label: "头球专家", icon: "sports_kabaddi" },
  { value: "LPASS", label: "长传手", icon: "near_me" },
  { value: "CROSS", label: "传中专家", icon: "swap_vert" },
  { value: "DRBLE", label: "盘带大师", icon: "cruelty_free" },
  { value: "LSHT", label: "远射", icon: "my_location" },
  { value: "CLUCH", label: "关键先生", icon: "emoji_events" },
  { value: "TACKL", label: "抢断大师", icon: "shield" },
  { value: "PSAVE", label: "点球门将", icon: "pan_tool" },
  { value: "CNTR", label: "反击启动", icon: "bolt" },
  { value: "REBND", label: "补射专家", icon: "replay" },
  { value: "FSTRT", label: "快发", icon: "timer" },
];

const EVENT_ICONS: Record<string, string> = {
  TRANSFER: "swap_horiz",
  YOUTH_PROMOTION: "trending_up",
  HAT_TRICK: "sports_kabaddi",
  CHAMPIONSHIP_TITLE: "emoji_events",
  GOLDEN_BOOT: "military_tech",
  ASSISTS_LEADER: "assist_hand",
  TACKLES_LEADER: "shield",
  MAN_OF_THE_MATCH: "star",
  INJURY: "local_hospital",
  DEBUT: "play_circle",
  LEAGUE_DEBUT: "stadium",
  CAPTAIN_DEBUT: "captain",
  RECORD_BROKEN: "record_voice_over",
  CONTRACT_RENEWAL: "renewal",
};

const EVENT_COLORS: Record<string, string> = {
  TRANSFER: "text-[#60a5fa]",
  YOUTH_PROMOTION: "text-[#34d399]",
  HAT_TRICK: "text-[#fbbf24]",
  CHAMPIONSHIP_TITLE: "text-[#f59e0b]",
  GOLDEN_BOOT: "text-[#fbbf24]",
  ASSISTS_LEADER: "text-[#60a5fa]",
  TACKLES_LEADER: "text-[#34d399]",
  MAN_OF_THE_MATCH: "text-[#f472b6]",
  INJURY: "text-[#ef4444]",
  DEBUT: "text-[#a78bfa]",
  LEAGUE_DEBUT: "text-[#a78bfa]",
  CAPTAIN_DEBUT: "text-[#fbbf24]",
  RECORD_BROKEN: "text-[#22d3ee]",
  CONTRACT_RENEWAL: "text-[#60a5fa]",
};

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface PlayerEvent {
  id: string;
  playerId: string;
  season: number;
  date: string;
  eventType: string;
  icon?: string;
  titleKey?: string;
  matchId?: string;
  titleData?: Record<string, any>;
  details?: any;
}

interface ListPlayerModalProps {
  player: Player;
  onClose: () => void;
  onSuccess: () => void;
}


function ListPlayerModal({ player, onClose, onSuccess }: ListPlayerModalProps) {
  const t = useTranslations();
  const [startPrice, setStartPrice] = useState("");
  const [buyoutPrice, setBuyoutPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = parseInt(startPrice, 10);
    const buyout = parseInt(buyoutPrice, 10);

    if (isNaN(start) || isNaN(buyout)) {
      setError("Please enter valid prices");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.transfers.createAuction(player.id, start, buyout);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list player");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#0a1a14] to-[#001e17] rounded-2xl border border-[#2f4e44]/50 shadow-2xl overflow-hidden">
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-gradient-to-r from-[#a1ffc2]/5 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#a1ffc2]">sell</span>
              </div>
              <div>
                <h3 className="text-lg font-black font-space text-[#d3f5e8]">{t("squad.transfer.listPlayer")}</h3>
                <p className="text-[10px] text-[#91b2a6] font-space uppercase tracking-wider">Set your auction terms</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#002c22] transition-colors">
              <span className="material-symbols-outlined text-[#91b6a] text-lg">close</span>
            </button>
          </div>
        </div>

        <div className="mx-6 mt-4 mb-4 p-4 bg-[#00251c]/80 rounded-xl border border-[#2f4e44]/20">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-space font-black text-lg text-[#a1ffc2]" style={{ background: "linear-gradient(135deg, #a1ffc220, #a1ffc210)" }}>
              {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-bold text-[#d3f5e8]">{player.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 bg-[#a1ffc2]/20 text-[#a1ffc2] text-[10px] font-bold rounded">PWI {player.pwi?.toLocaleString() || "0"}</span>
                <span className="text-[10px] text-[#91b2a6] font-space">{player.isGoalkeeper ? "GK" : ""}</span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#91b2a6] mb-1.5">{t("squad.transfer.startPrice")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91b2a6] text-sm font-space">£</span>
                <input type="number" value={startPrice} onChange={(e) => setStartPrice(e.target.value)} placeholder="0" min={0} className="w-full bg-[#001a12] border border-[#2f4e44]/40 rounded-lg pl-7 pr-3 py-2.5 text-[#d3f5e8] font-space text-sm placeholder:text-[#4a7a6a] focus:outline-none focus:border-[#a1ffc2]/60 transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#91b2a6] mb-1.5">{t("squad.transfer.buyoutPrice")}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91b2a6] text-sm font-space">£</span>
                <input type="number" value={buyoutPrice} onChange={(e) => setBuyoutPrice(e.target.value)} placeholder="0" min={0} className="w-full bg-[#001a12] border border-[#2f4e44]/40 rounded-lg pl-7 pr-3 py-2.5 text-[#d3f5e8] font-space text-sm placeholder:text-[#4a7a6a] focus:outline-none focus:border-[#a1ffc2]/60 transition-colors" />
              </div>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button type="submit" disabled={isSubmitting} className="w-full py-3 rounded-xl bg-[#a1ffc2] text-[#001a12] font-bold text-sm hover:bg-[#8ee6b8] disabled:opacity-50 transition-colors">
            {isSubmitting ? "Listing..." : t("squad.transfer.listButton")}
          </button>
        </form>
      </div>
    </div>
  );
}


export default function PlayerDetailPage({ params }: PageProps) {
  const t = useTranslations("squad");
  const te = useTranslations("player_events");
  const { user, team } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ locale: string; id: string } | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [auction, setAuction] = useState<TransferAuction | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);
  const [showBuyoutConfirm, setShowBuyoutConfirm] = useState(false);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams?.id) return;

    setIsLoading(true);
    api.players
      .getById(resolvedParams.id)
      .then((data) => {
        setPlayer(data);
        // Fetch player events
        return api.players.getEvents(resolvedParams.id);
      })
      .then((eventData) => {
        setEvents(eventData);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [resolvedParams?.id]);

  // Fetch auction when player is on transfer
  useEffect(() => {
    if (!player?.onTransfer || !player.id) return;
    api.transfers.getAuctions().then((auctions) => {
      const found = auctions.find((a) => a.player.id === player.id);
      setAuction(found || null);
    }).catch(console.error);
  }, [player?.id, player?.onTransfer]);

  // Pre-fill bid amount when auction is loaded
  useEffect(() => {
    if (auction && team) {
      const userBids = auction.bidHistory.filter(b => b.teamId === team.id);
      if (userBids.length > 0) {
        const lastBid = userBids[userBids.length - 1].amount;
        const newBid = Math.max(lastBid + 10000, Math.ceil(lastBid * 1.05));
        setBidAmount(newBid.toString());
      } else {
        setBidAmount(auction.startPrice.toString());
      }
    }
  }, [auction, team]);

  const formatCurrency = (value: number) => `£${value.toLocaleString()}`;

  const formatBidAmountInput = (value: string) => {
    const num = parseInt(value.replace(/,/g, ''), 10);
    if (isNaN(num)) return '';
    return num.toLocaleString();
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Circular gauge component
  const renderGauge = (value: number, max: number, label: string, colorClass: string) => {
    const percentage = (value / max) * 100;
    const circumference = 2 * Math.PI * 20;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="bg-[#00251c] rounded-xl p-3 flex flex-col items-center justify-center border border-[#2f4e44]/10">
        <div className="relative w-11 h-11 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle cx="22" cy="22" fill="transparent" r="20" stroke="#00251c" strokeWidth="3" />
            <circle
              cx="22"
              cy="22"
              fill="transparent"
              r="20"
              className={colorClass}
              strokeWidth="3"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-sm font-black font-space">{value}</span>
        </div>
        <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-[#91b2a6]">
          {label}
        </span>
      </div>
    );
  };

  // Skill bar component
  const renderSkillBar = (label: string, value: number, potential: number, colorClass: string) => {
    const percentage = (value / SKILL_MAX) * 100;

    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#91b2a6]">
          <span>{label}</span>
          <span className={colorClass}>{value}/{potential}</span>
        </div>
        <div className="h-1.5 w-full bg-[#00251c] rounded-full overflow-hidden">
          <div className={`h-full ${colorClass.replace("text-", "bg-")} rounded-full`} style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#00110c]">
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        <Header title={t("title")} />

        <div className="flex-grow p-6 pt-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full w-full">
              <span className="material-symbols-outlined text-4xl text-[#a1ffc2] animate-spin">
                progress_activity
              </span>
            </div>
          ) : player ? (
            <div className="w-full max-w-[580px] mx-auto pb-8">
              {/* Player Card */}
              <div className="bg-[#001e17] rounded-xl flex flex-col overflow-hidden relative min-h-[600px]">
                {/* Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#a1ffc2]/5 to-transparent pointer-events-none" />

                {/* Player Header Section */}
                <div className="p-6 pb-4 relative flex items-start justify-between">
                  <div className="flex gap-8">
                    {/* Avatar */}
                    <div className="relative">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#a1ffc2]/30 p-1 bg-[#002c22]">
                        <div
                          className="w-full h-full rounded-xl flex items-center justify-center font-space font-black text-3xl text-[#a1ffc2]"
                          style={{
                            background: "linear-gradient(135deg, #a1ffc220, #a1ffc210)",
                          }}
                        >
                          {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                      </div>
                    </div>

                    {/* Name & Bio */}
                    <div>
                      <h1 className="text-4xl font-black font-space tracking-tight leading-none text-[#d3f5e8]">
                        {player.name}
                      </h1>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#91b2a6] text-sm">calendar_month</span>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#91b2a6]">{player.age}y {player.ageDays}d</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#91b2a6] text-sm">military_tech</span>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#91b2a6]">{t("exp")} {player.experience}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#91b2a6] text-sm">payments</span>
                          <span className="text-xs font-bold uppercase tracking-widest text-[#f59e0b]">£{(player.currentWage || 0).toLocaleString()}/w</span>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <span className="bg-[#3e6a00]/20 text-[#abf853] px-3 py-1 rounded-full text-[10px] font-bold font-space">
                          {player.potentialTier.replace("_", " ")}
                        </span>
                        {player.isGoalkeeper && (
                          <span className="bg-[#0066ff]/20 text-[#60a5fa] px-3 py-1 rounded-full text-[10px] font-bold font-space">
                            GOALKEEPER
                          </span>
                        )}
                        {player.onTransfer && (
                          <span className="bg-[#a1ffc2]/20 text-[#a1ffc2] px-3 py-1 rounded-full text-[10px] font-bold font-space">
                            ON TRANSFER
                          </span>
                        )}
                        {player.isYouth && (
                          <span className="bg-[#f59e0b]/20 text-[#f59e0b] px-3 py-1 rounded-full text-[10px] font-bold font-space">
                            YOUTH
                          </span>
                        )}
                      </div>

                      {/* Specialties */}
                      {player.specialty && (
                        <div className="mt-4 flex gap-2">
                          {(() => {
                            const specInfo = SPECIALTIES.find((s) => s.value === player.specialty);
                            return (
                              <span
                                className="inline-flex items-center gap-1.5 bg-[#a1ffc2]/10 text-[#a1ffc2] px-3 py-1 rounded-full text-[10px] font-bold font-space border border-[#a1ffc2]/20"
                              >
                                <span className="material-symbols-outlined text-sm">{specInfo?.icon || "star"}</span>
                                {specInfo?.label || player.specialty}
                              </span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {!player.onTransfer && (
                      <button
                        onClick={() => setShowListModal(true)}
                        className="w-10 h-10 rounded-full flex items-center justify-center bg-[#a1ffc2]/20 text-[#a1ffc2] hover:bg-[#a1ffc2]/30 transition-colors border border-[#a1ffc2]/30"
                        title={t("transfer.listButton")}
                      >
                        <span className="material-symbols-outlined">sell</span>
                      </button>
                    )}
                    <button className="w-10 h-10 rounded-full flex items-center justify-center bg-[#002c22] text-[#91b2a6] hover:text-[#a1ffc2] transition-colors border border-[#2f4e44]/20">
                      <span className="material-symbols-outlined">favorite</span>
                    </button>
                    <button className="w-10 h-10 rounded-full flex items-center justify-center bg-[#002c22] text-[#91b2a6] hover:text-[#a1ffc2] transition-colors border border-[#2f4e44]/20">
                      <span className="material-symbols-outlined">share</span>
                    </button>
                  </div>
                </div>

                {/* Gauges Area */}
                <div className="px-6 py-4 grid grid-cols-4 gap-3">
                  {/* PWI - Simple text display */}
                  <div className="bg-[#00251c] rounded-xl p-3 flex flex-col items-center justify-center border border-[#2f4e44]/10">
                    <div className="text-lg font-black font-space text-[#a1ffc2]">{player.pwi.toLocaleString()}</div>
                    <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-[#91b2a6]">PWI</span>
                  </div>
                  {renderGauge(
                    player.stamina,
                    5.99,
                    t("stamina"),
                    player.stamina >= 4 ? "text-[#a1ffc2]" : player.stamina >= 2 ? "text-[#abf853]" : "text-red-400"
                  )}
                  {renderGauge(
                    player.form,
                    5.99,
                    t("form"),
                    player.form >= 4 ? "text-[#a1ffc2]" : player.form >= 2 ? "text-[#abf853]" : "text-red-400"
                  )}
                  {renderGauge(player.potentialAbility, 99, "PA", "text-[#00ec90]")}
                </div>

                {/* Transfer Market Section */}
                {player.onTransfer && auction && (
                  <div className="px-6 pb-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#a1ffc2]">sell</span>
                        <h4 className="text-xs font-black font-space tracking-widest uppercase text-[#a1ffc2]">
                          {t("transfer.onTransfer")}
                        </h4>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                        formatTimeRemaining(auction.expiresAt) === "Expired"
                          ? "bg-red-500/80"
                          : "bg-[#002c22]/80 backdrop-blur-md"
                      }`}>
                        <span className="material-symbols-outlined text-xs text-[#ef4444]">timer</span>
                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">{formatTimeRemaining(auction.expiresAt)}</span>
                      </div>
                    </div>

                    {/* Pricing & Actions */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-[#002c22] p-4 rounded-2xl border border-[#2f4e44]/10">
                        <p className="text-[10px] text-[#91b2a6] uppercase tracking-widest mb-1">Current Price</p>
                        <p className="text-2xl font-bold text-[#a1ffc2] truncate">{formatCurrency(auction.currentPrice)}</p>
                      </div>
                      <div className="bg-[#002c22] p-4 rounded-2xl border border-[#2f4e44]/10">
                        <p className="text-[10px] text-[#91b2a6] uppercase tracking-widest mb-1">Buyout</p>
                        <p className="text-xl font-bold text-[#d3f5e8] mb-2 truncate">{formatCurrency(auction.buyoutPrice)}</p>
                        {team && auction.team?.id !== team.id && (
                          <button
                            onClick={() => setShowBuyoutConfirm(true)}
                            className="w-full py-2 bg-[#a1ffc2] text-[#00110c] font-bold text-[10px] rounded-lg uppercase tracking-widest hover:brightness-110 transition-all"
                          >
                            Buy
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Bid History */}
                    {auction.bidHistory && auction.bidHistory.length > 0 && (
                      <div className="mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="material-symbols-outlined text-[#a1ffc2] text-sm">gavel</span>
                          <h4 className="text-[10px] uppercase tracking-widest text-[#91b2a6] font-bold">Bid History</h4>
                        </div>
                        <div className="divide-y divide-[#2f4e44]/20">
                          {[...auction.bidHistory].reverse().slice(0, 3).map((bid, idx) => (
                            <div key={idx} className="flex items-center justify-between py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#a1ffc2]/30 to-[#002c22] flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-[#a1ffc2]">{(bid.teamName || '?').charAt(0)}</span>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-[#d3f5e8]">{bid.teamName || 'Unknown'}</p>
                                  <p className="text-[9px] text-[#91b2a6]">{new Date(bid.timestamp).toLocaleString()}</p>
                                </div>
                              </div>
                              <p className="text-[12px] font-bold text-[#a1ffc2]">{formatCurrency(bid.amount)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bid Input */}
                    {team && auction.team?.id !== team.id && (
                      <div className="p-4 bg-[#001e17] rounded-xl border border-[#2f4e44]/10">
                        <div className="flex gap-3 items-center">
                          <div className="flex-1 relative">
                            <label className="absolute -top-2 left-3 px-1 bg-[#001e17] text-[8px] text-[#00ec90] font-bold uppercase tracking-widest z-10">
                              Offer Price
                            </label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#a1ffc2] font-bold text-sm">£</span>
                              <input
                                className="w-full bg-[#002c22] border border-[#2f4e44]/30 rounded-xl py-3 pl-8 pr-4 text-sm font-bold text-[#d3f5e8] focus:ring-1 focus:ring-[#a1ffc2] focus:border-[#a1ffc2] transition-all placeholder:text-[#91b2a6]/40"
                                placeholder="Enter offer"
                                type="text"
                                value={formatBidAmountInput(bidAmount)}
                                onChange={(e) => setBidAmount(e.target.value.replace(/,/g, '').replace(/[^0-9]/g, ''))}
                              />
                            </div>
                          </div>
                          <button
                            className="px-6 py-3.5 bg-[#a1ffc2] text-[#00110c] font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#a1ffc2]/20 uppercase tracking-widest text-[10px] whitespace-nowrap disabled:opacity-50"
                            onClick={async () => {
                              if (!auction || !bidAmount || !team) return;
                              const amount = parseInt(bidAmount.replace(/,/g, ""), 10);
                              if (isNaN(amount) || amount <= 0) return;
                              setIsSubmittingBid(true);
                              try {
                                await api.transfers.placeBid(auction.id, amount);
                                const auctions = await api.transfers.getAuctions();
                                const found = auctions.find((a) => a.player.id === player?.id);
                                setAuction(found || null);
                                setBidAmount("");
                              } catch (err) {
                                console.error("Failed to place bid:", err);
                              } finally {
                                setIsSubmittingBid(false);
                              }
                            }}
                            disabled={!bidAmount || isSubmittingBid}
                          >
                            <span className="material-symbols-outlined text-sm">payments</span>
                            Make Offer
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Skills Matrix */}
                <div className="flex-grow overflow-y-auto custom-scrollbar px-6 pb-6">
                  <div className="grid grid-cols-2 gap-10">
                    {/* Physical & Technical */}
                    <div className="space-y-8">
                      {/* Physical */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
                          <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("skills.physicalAttributes")}</h3>
                        </div>
                        <div className="space-y-3">
                          {renderSkillBar(t("skills.pace"), player.currentSkills.physical?.pace || 0, player.potentialSkills.physical?.pace || 0, "text-[#a1ffc2]")}
                          {renderSkillBar(t("skills.strength"), player.currentSkills.physical?.strength || 0, player.potentialSkills.physical?.strength || 0, "text-[#a1ffc2]")}
                        </div>
                      </div>

                      {/* Technical */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
                          <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">
                            {player.isGoalkeeper ? t("skills.goalkeeperSkills") : t("skills.technicalSkills")}
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {player.isGoalkeeper ? (
                            <>
                              {renderSkillBar(t("skills.reflexes"), (player.currentSkills.technical as any)?.reflexes || 0, (player.potentialSkills.technical as any)?.reflexes || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.handling"), (player.currentSkills.technical as any)?.handling || 0, (player.potentialSkills.technical as any)?.handling || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.aerial"), (player.currentSkills.technical as any)?.aerial || 0, (player.potentialSkills.technical as any)?.aerial || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.positioning"), (player.currentSkills.technical as any)?.positioning || 0, (player.potentialSkills.technical as any)?.positioning || 0, "text-[#a1ffc2]")}
                            </>
                          ) : (
                            <>
                              {renderSkillBar(t("skills.finishing"), (player.currentSkills.technical as any)?.finishing || 0, (player.potentialSkills.technical as any)?.finishing || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.passing"), (player.currentSkills.technical as any)?.passing || 0, (player.potentialSkills.technical as any)?.passing || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.dribbling"), (player.currentSkills.technical as any)?.dribbling || 0, (player.potentialSkills.technical as any)?.dribbling || 0, "text-[#a1ffc2]")}
                              {renderSkillBar(t("skills.defending"), (player.currentSkills.technical as any)?.defending || 0, (player.potentialSkills.technical as any)?.defending || 0, "text-[#a1ffc2]")}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Mental & Set Pieces */}
                    <div className="space-y-8">
                      {/* Mental */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                          <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("skills.mentalProfile")}</h3>
                        </div>
                        <div className="space-y-3">
                          {renderSkillBar(t("skills.positioning"), player.currentSkills.mental?.positioning || 0, player.potentialSkills.mental?.positioning || 0, "text-[#abf853]")}
                          {renderSkillBar(t("skills.composure"), player.currentSkills.mental?.composure || 0, player.potentialSkills.mental?.composure || 0, "text-[#abf853]")}
                        </div>
                      </div>

                      {/* Set Pieces */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                          <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{t("skills.setPieces")}</h3>
                        </div>
                        <div className="space-y-3">
                          {renderSkillBar(t("skills.freeKicks"), player.currentSkills.setPieces?.freeKicks || 0, player.potentialSkills.setPieces?.freeKicks || 0, "text-[#abf853]")}
                          {renderSkillBar(t("skills.penalties"), player.currentSkills.setPieces?.penalties || 0, player.potentialSkills.setPieces?.penalties || 0, "text-[#abf853]")}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Player Events Section */}
                <div className="px-6 pb-6 border-t border-[#2f4e44]/20">
                  <div className="flex items-center gap-2 mt-4 mb-3">
                    <div className="w-1.5 h-4 bg-[#f59e0b] rounded-full" />
                    <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">{te("title")}</h3>
                  </div>
                  {events.length === 0 ? (
                    <div className="bg-[#00251c]/50 rounded-xl p-6 text-center">
                      <span className="material-symbols-outlined text-3xl text-[#4a7a6a]">history</span>
                      <p className="text-[#4a7a6a] text-xs mt-2">{te("no_events")}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {events.map((event) => {
                        const iconName = EVENT_ICONS[event.eventType] || "event";
                        const colorClass = EVENT_COLORS[event.eventType] || "text-[#a1ffc2]";
                        const eventLabel = event.titleKey ? te(event.titleKey.replace(/^player_events\./, '')) : event.eventType;
                        const eventDate = new Date(event.date);
                        const dateStr = `${eventDate.getFullYear()}/${eventDate.getMonth() + 1}/${eventDate.getDate()}`;

                        return (
                          <div key={event.id} className="flex items-center gap-3 p-3 bg-[#00251c]/30 rounded-lg">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-[#00251c] ${colorClass}`}>
                              <span className="material-symbols-outlined text-lg">{iconName}</span>
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-bold text-[#d3f5e8]">{eventLabel}</p>
                              <p className="text-xs text-[#91b2a6]">
                                {dateStr} - Season {event.season}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-[700px] mx-auto text-center">
              <p className="text-[#91b2a6] text-lg">{t("playerNotFound") || "Player not found"}</p>
              <Link
                href={`/${resolvedParams?.locale}/teams/squad`}
                className="inline-flex items-center gap-2 text-[#a1ffc2] hover:text-[#8ee6b8] transition-colors mt-4 text-sm font-bold"
              >
                <span className="material-symbols-outlined text-lg">arrow_back</span>
                {t("backToSquad") || "Back to Squad"}
              </Link>
            </div>
          )}
        </div>
      </main>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #00251c;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #00251c;
        }
      `}</style>

      {/* List Player Modal */}
      {showListModal && player && (
        <ListPlayerModal
          player={player}
          onClose={() => setShowListModal(false)}
          onSuccess={() => {
            // Refresh player data
            if (resolvedParams?.id) {
              api.players.getById(resolvedParams.id).then(setPlayer);
            }
          }}
        />
      )}

      {/* Buyout Confirmation Modal */}
      {showBuyoutConfirm && auction && player && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#001e17]/90 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl border border-[#a1ffc2]/20 w-full max-w-md">
            <div className="p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-[#002c22] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-[#a1ffc2]">warning</span>
              </div>
              <h3 className="text-xl font-bold text-[#d3f5e8] mb-2">Confirm Buyout</h3>
              <p className="text-[#91b2a6] text-sm mb-6">
                Buy out <span className="text-[#d3f5e8] font-bold">{player.name}</span> for <span className="text-[#a1ffc2] font-bold">{formatCurrency(auction.buyoutPrice)}</span>?
              </p>
              <div className="flex gap-4">
                <button
                  className="flex-1 py-3 bg-[#002c22] text-[#d3f5e8] font-bold rounded-xl hover:bg-[#003328] transition-all uppercase tracking-widest text-xs"
                  onClick={() => setShowBuyoutConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="flex-1 py-3 bg-[#ef4444] text-white font-bold rounded-xl hover:bg-red-600 transition-all uppercase tracking-widest text-xs"
                  onClick={async () => {
                    try {
                      await api.transfers.buyout(auction.id);
                      setShowBuyoutConfirm(false);
                      const auctions = await api.transfers.getAuctions();
                      const found = auctions.find((a) => a.player.id === player.id);
                      setAuction(found || null);
                    } catch (err) {
                      console.error("Buyout failed:", err);
                    }
                  }}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
