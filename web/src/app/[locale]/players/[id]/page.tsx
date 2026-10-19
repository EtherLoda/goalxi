"use client";

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, type Player, type TransferAuction } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { PlayerSeasonStatsCard } from "@/components/player/PlayerSeasonStatsCard";
import { getSpecialtyLabel } from "@/lib/specialties";
import { ExperienceTierLabel } from "@/components/ExperienceTierLabel";
import { barClassFor } from "@/components/player/skill-display";

const SKILL_MAX = 20;

const EVENT_ICONS: Record<string, MaterialIconName> = {
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
  TRANSFER: "text-signal-blue",
  YOUTH_PROMOTION: "text-positive-bright",
  HAT_TRICK: "text-signal-gold",
  CHAMPIONSHIP_TITLE: "text-signal-amber",
  GOLDEN_BOOT: "text-signal-gold",
  ASSISTS_LEADER: "text-signal-blue",
  TACKLES_LEADER: "text-positive-bright",
  MAN_OF_THE_MATCH: "text-signal-magenta",
  INJURY: "text-danger",
  DEBUT: "text-signal-violet",
  LEAGUE_DEBUT: "text-signal-violet",
  CAPTAIN_DEBUT: "text-signal-gold",
  RECORD_BROKEN: "text-signal-cyan",
  CONTRACT_RENEWAL: "text-signal-blue",
};

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface PlayerEvent {
  id: string;
  playerId: number;
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const start = parseInt(startPrice, 10);

    if (isNaN(start) || start <= 0) {
      setError("Please enter a valid starting price");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Buyout is a hidden v2 mechanic — the backend DTO still
      // requires a numeric value, so we auto-derive it as 2× the
      // start price (the standard FM "release clause" markup). When
      // v2 re-enables the UI, swap this back to a user-controlled
      // input and re-translate `squad.transfer.buyoutPrice`.
      const buyout = start * 2;
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
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-gradient-to-b from-ink-750 to-ink-800 rounded-2xl border border-edge/50 shadow-2xl overflow-hidden">
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-linear-to-r from-accent/5 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <AppIcon name="sell" className="text-accent" />
              </div>
              <div>
                <h3 className="text-lg font-black font-space text-frost">
                  {t("squad.transfer.listPlayer")}
                </h3>
                <p className="text-[10px] text-muted font-space uppercase tracking-wider">
                  Set your auction terms
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-ink-600 transition-colors"
              aria-label={t("common.close")}
            >
              <AppIcon name="close" className="text-[#91b6a] text-lg" />
            </button>
          </div>
        </div>

        <div className="mx-6 mt-4 mb-4 p-4 bg-ink-700/80 rounded-xl border border-edge/20">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-space font-black text-lg text-accent"
              style={{
                background: "linear-gradient(135deg, #a1ffc220, #a1ffc210)",
              }}
            >
              {player.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-bold text-frost">{player.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 bg-accent/20 text-accent text-[10px] font-bold rounded">
                  PWI {player.pwi?.toLocaleString() || "0"}
                </span>
                <span className="text-[10px] text-muted font-space">
                  {player.isGoalkeeper ? "GK" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted mb-1.5">
              {t("squad.transfer.startPrice")}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-space">
                £
              </span>
              <input
                type="number"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-ink-850 border border-edge/40 rounded-lg pl-7 pr-3 py-2.5 text-frost font-space text-sm placeholder:text-faint focus:outline-none focus:border-accent/60 transition-colors"
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 rounded-xl bg-accent text-ink-850 font-bold text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? t("squad.transfer.listing") : t("squad.transfer.listButton")}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function PlayerDetailPage({ params }: PageProps) {
  const t = useTranslations("squad");
  const tt = useTranslations("transfers");
  const tc = useTranslations("common");
  const te = useTranslations("player_events");
  const { user, team } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{
    locale: string;
    id: string;
  } | null>(null);
  const [showListModal, setShowListModal] = useState(false);
  const [auction, setAuction] = useState<TransferAuction | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [isSubmittingBid, setIsSubmittingBid] = useState(false);

  useEffect(() => {
    params.then(setResolvedParams);
  }, [params]);

  useEffect(() => {
    if (!resolvedParams?.id) return;

    const playerId = parseInt(resolvedParams.id, 10);
    if (Number.isNaN(playerId)) return;

    setIsLoading(true);
    api.players
      .getById(playerId)
      .then((data) => {
        setPlayer(data);
        // Fetch player events
        return api.players.getEvents(playerId);
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
    api.transfers
      .getAuctions()
      .then((auctions) => {
        const found = auctions.find((a) => a.player.id === player.id);
        setAuction(found || null);
      })
      .catch(console.error);
  }, [player?.id, player?.onTransfer]);

  // Pre-fill bid amount when auction is loaded
  useEffect(() => {
    if (auction && team) {
      const userBids = auction.bidHistory.filter((b) => b.teamId === team.id);
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
    const num = parseInt(value.replace(/,/g, ""), 10);
    if (isNaN(num)) return "";
    return num.toLocaleString();
  };

  const formatTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    if (diff <= 0) return tt("expired");
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  // Circular gauge component
  const renderGauge = (
    value: number,
    max: number,
    label: string,
    colorClass: string,
  ) => {
    const percentage = (value / max) * 100;
    const circumference = 2 * Math.PI * 20;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="bg-ink-700 rounded-xl p-3 flex flex-col items-center justify-center border border-edge/10">
        <div className="relative w-11 h-11 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle
              cx="22"
              cy="22"
              fill="transparent"
              r="20"
              stroke="#00251c"
              strokeWidth="3"
            />
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
          <span className="absolute text-sm font-black font-space">
            {value}
          </span>
        </div>
        <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-muted">
          {label}
        </span>
      </div>
    );
  };

  // Skill bar component
  const renderSkillBar = (
    label: string,
    value: number,
    potential: number,
    colorClass: string,
  ) => {
    const percentage = (value / SKILL_MAX) * 100;

    return (
      <div className="space-y-1.5">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
          <span>{label}</span>
          <span className={colorClass}>
            {value}/{potential}
          </span>
        </div>
        <div className="h-1.5 w-full bg-ink-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${barClassFor(colorClass)} rounded-full`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="flex-grow p-6 pt-10">
        {isLoading ? (
          <div className="flex items-center justify-center h-full w-full">
            <AppIcon name="progress_activity" className="text-4xl text-accent animate-spin" />
          </div>
        ) : player ? (
          <div className="w-full max-w-[580px] mx-auto pb-8">
            {/* Player Card */}
            <div className="bg-ink-800 rounded-xl flex flex-col relative min-h-[600px]">
              {/* Glass Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />

              {/* Player Header Section */}
              <div className="p-6 pb-4 relative flex items-start justify-between">
                <div className="flex gap-8">
                  {/* Avatar */}
                  <div className="relative">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-accent/30 p-1 bg-ink-600">
                      <div
                        className="w-full h-full rounded-xl flex items-center justify-center font-space font-black text-3xl text-accent"
                        style={{
                          background:
                            "linear-gradient(135deg, #a1ffc220, #a1ffc210)",
                        }}
                      >
                        {player.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                    </div>
                  </div>

                  {/* Name & Bio */}
                  <div>
                    <div className="flex items-center gap-3">
                      <h1 className="text-4xl font-black font-space tracking-tight leading-none text-frost">
                        {player.name}
                      </h1>
                      {player.coreSpecialty && (
                        <span
                          className={`inline-flex items-center ${
                            player.coreSpecialtyTier === "GOLD"
                              ? "text-amber-300"
                              : player.coreSpecialtyTier === "SILVER"
                                ? "text-slate-300"
                                : "text-stone-400"
                          }`}
                        >
                          <SpecialtyIcon
                            code={player.coreSpecialty}
                            tier={player.coreSpecialtyTier}
                            size="xl"
                          />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-2">
                        <AppIcon name="calendar_month" className="text-muted text-sm" />
                        <span className="text-xs font-bold uppercase tracking-widest text-muted">
                          {tc("ageFormat", { y: player.age, d: player.ageDays })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AppIcon name="military_tech" className="text-muted text-sm" />
                        <span className="text-xs font-bold uppercase tracking-widest text-muted">
                          {t("exp")} <ExperienceTierLabel value={player.experience} className="text-frost" />
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <AppIcon name="payments" className="text-muted text-sm" />
                        <span className="text-xs font-bold uppercase tracking-widest text-signal-amber">
                          £{(player.currentWage || 0).toLocaleString()}/w
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      {player.potentialTier && (
                        <span className="bg-signal-lime-dim/20 text-signal-lime px-3 py-1 rounded-full text-[10px] font-bold font-space">
                          {player.potentialTier.replace("_", " ")}
                        </span>
                      )}
                      {player.isGoalkeeper && (
                        <span className="bg-signal-blue-deep/20 text-signal-blue px-3 py-1 rounded-full text-[10px] font-bold font-space">
                          {tt("status.goalkeeper")}
                        </span>
                      )}
                      {player.onTransfer && (
                        <span className="bg-accent/20 text-accent px-3 py-1 rounded-full text-[10px] font-bold font-space">
                          {tt("status.onTransfer")}
                        </span>
                      )}
                      {player.isYouth && (
                        <span className="bg-signal-amber/20 text-signal-amber px-3 py-1 rounded-full text-[10px] font-bold font-space">
                          {tt("status.youth")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {!player.onTransfer && (
                    <button
                      onClick={() => setShowListModal(true)}
                      className="w-10 h-10 rounded-full flex items-center justify-center bg-accent/20 text-accent hover:bg-accent/30 transition-colors border border-accent/30"
                      title={t("transfer.listButton")}
                      aria-label={t("transfer.listButton")}
                    >
                      <AppIcon name="sell" />
                    </button>
                  )}
                  <button
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-ink-600 text-muted hover:text-accent transition-colors border border-edge/20"
                    aria-label={tc("favorite")}
                  >
                    <AppIcon name="favorite" />
                  </button>
                  <button
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-ink-600 text-muted hover:text-accent transition-colors border border-edge/20"
                    aria-label={tc("share")}
                  >
                    <AppIcon name="share" />
                  </button>
                </div>
              </div>

              {/* Gauges Area */}
              <div className="px-6 py-4 grid grid-cols-4 gap-3">
                {/* PWI - Simple text display */}
                <div className="bg-ink-700 rounded-xl p-3 flex flex-col items-center justify-center border border-edge/10">
                  <div className="text-lg font-black font-space text-accent">
                    {player.pwi?.toLocaleString() || "0"}
                  </div>
                  <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-muted">
                    PWI
                  </span>
                </div>
                {renderGauge(
                  player.stamina,
                  5.99,
                  t("stamina"),
                  player.stamina >= 4
                    ? "text-accent"
                    : player.stamina >= 2
                      ? "text-signal-lime"
                      : "text-red-400",
                )}
                {renderGauge(
                  player.form,
                  5.99,
                  t("form"),
                  player.form >= 4
                    ? "text-accent"
                    : player.form >= 2
                      ? "text-signal-lime"
                      : "text-red-400",
                )}
                {renderGauge(
                  player.potentialAbility,
                  99,
                  "PA",
                  "text-primary-dim",
                )}
              </div>

              {/* Transfer Market Section */}
              {player.onTransfer && auction && (
                <div className="px-6 pb-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AppIcon name="sell" className="text-accent" />
                      <h4 className="text-xs font-black font-space tracking-widest uppercase text-accent">
                        {t("transfer.onTransfer")}
                      </h4>
                    </div>
                    <div
                      className={`px-3 py-1.5 rounded-lg flex items-center gap-2 ${
                        formatTimeRemaining(auction.expiresAt) === tt("expired")
                          ? "bg-danger/80"
                          : "bg-ink-600/80 backdrop-blur-md"
                      }`}
                    >
                      <AppIcon name="timer" className="text-xs text-danger" />
                      <span className="text-[10px] font-bold text-on-surface uppercase tracking-wider">
                        {formatTimeRemaining(auction.expiresAt)}
                      </span>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="mb-4">
                    <div className="bg-ink-600 p-4 rounded-2xl border border-edge/10">
                      <p className="text-[10px] text-muted uppercase tracking-widest mb-1">
                        {tt("detail.currentPrice")}
                      </p>
                      <p className="text-2xl font-bold text-accent truncate">
                        {formatCurrency(auction.currentPrice)}
                      </p>
                    </div>
                  </div>

                  {/* Bid History */}
                  {auction.bidHistory && auction.bidHistory.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AppIcon name="gavel" className="text-accent text-sm" />
                        <h4 className="text-[10px] uppercase tracking-widest text-muted font-bold">
                          Bid History
                        </h4>
                      </div>
                      <div className="divide-y divide-edge/20">
                        {[...auction.bidHistory]
                          .reverse()
                          .slice(0, 3)
                          .map((bid, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between py-3"
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/30 to-ink-600 flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-accent">
                                    {(bid.teamName || "?").charAt(0)}
                                  </span>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-frost">
                                    {bid.teamName || "Unknown"}
                                  </p>
                                  <p className="text-[9px] text-muted">
                                    {new Date(bid.timestamp).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                              <p className="text-[12px] font-bold text-accent">
                                {formatCurrency(bid.amount)}
                              </p>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Bid Input */}
                  {team && auction.team?.id !== team.id && (
                    <div className="p-4 bg-ink-800 rounded-xl border border-edge/10">
                      <div className="flex gap-3 items-center">
                        <div className="flex-1 relative">
                          <label className="absolute -top-2 left-3 px-1 bg-ink-800 text-[8px] text-primary-dim font-bold uppercase tracking-widest z-10">
                            {tt("detail.offerPrice")}
                          </label>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-accent font-bold text-sm">
                              {tc("currencySymbol")}
                            </span>
                            <input
                              className="w-full bg-ink-600 border border-edge/30 rounded-xl py-3 pl-8 pr-4 text-sm font-bold text-frost focus:ring-1 focus:ring-accent focus:border-accent transition-all placeholder:text-muted/40"
                              placeholder={tt("placeholder.enterOffer")}
                              type="text"
                              value={formatBidAmountInput(bidAmount)}
                              onChange={(e) =>
                                setBidAmount(
                                  e.target.value
                                    .replace(/,/g, "")
                                    .replace(/[^0-9]/g, ""),
                                )
                              }
                            />
                          </div>
                        </div>
                        <button
                          className="px-6 py-3.5 bg-accent text-ink-1000 font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-accent/20 uppercase tracking-widest text-[10px] whitespace-nowrap disabled:opacity-50"
                          onClick={async () => {
                            if (!auction || !bidAmount || !team) return;
                            const amount = parseInt(
                              bidAmount.replace(/,/g, ""),
                              10,
                            );
                            if (isNaN(amount) || amount <= 0) return;
                            setIsSubmittingBid(true);
                            try {
                              await api.transfers.placeBid(auction.id, amount);
                              const auctions =
                                await api.transfers.getAuctions();
                              const found = auctions.find(
                                (a) => a.player.id === player?.id,
                              );
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
                          <AppIcon name="payments" className="text-sm" />
                          {tt("detail.makeOffer")}
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
                        <div className="w-1.5 h-4 bg-signal-blue rounded-full" />
                        <h3 className="text-xs font-black font-space tracking-widest uppercase text-muted">
                          {t("skills.physicalAttributes")}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {renderSkillBar(
                          t("skills.pace"),
                          player.currentSkills.physical?.pace || 0,
                          player.potentialSkills.physical?.pace || 0,
                          "text-signal-blue",
                        )}
                        {renderSkillBar(
                          t("skills.strength"),
                          player.currentSkills.physical?.strength || 0,
                          player.potentialSkills.physical?.strength || 0,
                          "text-signal-blue",
                        )}
                      </div>
                    </div>

                    {/* Technical */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div
                          className={`w-1.5 h-4 ${player.isGoalkeeper ? "bg-accent" : "bg-accent"} rounded-full`}
                        />
                        <h3 className="text-xs font-black font-space tracking-widest uppercase text-muted">
                          {player.isGoalkeeper
                            ? t("skills.goalkeeperSkills")
                            : t("skills.technicalSkills")}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {player.isGoalkeeper ? (
                          <>
                            {renderSkillBar(
                              t("skills.reflexes"),
                              (player.currentSkills.technical as any)
                                ?.reflexes || 0,
                              (player.potentialSkills.technical as any)
                                ?.reflexes || 0,
                              "text-accent",
                            )}
                            {renderSkillBar(
                              t("skills.handling"),
                              (player.currentSkills.technical as any)
                                ?.handling || 0,
                              (player.potentialSkills.technical as any)
                                ?.handling || 0,
                              "text-accent",
                            )}
                            {renderSkillBar(
                              t("skills.aerial"),
                              (player.currentSkills.technical as any)?.aerial ||
                                0,
                              (player.potentialSkills.technical as any)
                                ?.aerial || 0,
                              "text-accent",
                            )}
                          </>
                        ) : (
                          <>
                            {renderSkillBar(
                              t("skills.finishing"),
                              (player.currentSkills.technical as any)
                                ?.finishing || 0,
                              (player.potentialSkills.technical as any)
                                ?.finishing || 0,
                              "text-accent",
                            )}
                            {renderSkillBar(
                              t("skills.passing"),
                              (player.currentSkills.technical as any)
                                ?.passing || 0,
                              (player.potentialSkills.technical as any)
                                ?.passing || 0,
                              "text-accent",
                            )}
                            {renderSkillBar(
                              t("skills.dribbling"),
                              (player.currentSkills.technical as any)
                                ?.dribbling || 0,
                              (player.potentialSkills.technical as any)
                                ?.dribbling || 0,
                              "text-accent",
                            )}
                            {renderSkillBar(
                              t("skills.defending"),
                              (player.currentSkills.technical as any)
                                ?.defending || 0,
                              (player.potentialSkills.technical as any)
                                ?.defending || 0,
                              "text-accent",
                            )}
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
                        <div className="w-1.5 h-4 bg-signal-lime rounded-full" />
                        <h3 className="text-xs font-black font-space tracking-widest uppercase text-muted">
                          {t("skills.mentalProfile")}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {renderSkillBar(
                          t("skills.positioning"),
                          player.currentSkills.mental?.positioning || 0,
                          player.potentialSkills.mental?.positioning || 0,
                          "text-signal-lime",
                        )}
                        {renderSkillBar(
                          t("skills.composure"),
                          player.currentSkills.mental?.composure || 0,
                          player.potentialSkills.mental?.composure || 0,
                          "text-signal-lime",
                        )}
                      </div>
                    </div>

                    {/* Set Pieces */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-1.5 h-4 bg-signal-amber rounded-full" />
                        <h3 className="text-xs font-black font-space tracking-widest uppercase text-muted">
                          {t("skills.setPieces")}
                        </h3>
                      </div>
                      <div className="space-y-3">
                        {renderSkillBar(
                          t("skills.freeKicks"),
                          player.currentSkills.setPieces?.freeKicks || 0,
                          player.potentialSkills.setPieces?.freeKicks || 0,
                          "text-signal-amber",
                        )}
                        {renderSkillBar(
                          t("skills.penalties"),
                          player.currentSkills.setPieces?.penalties || 0,
                          player.potentialSkills.setPieces?.penalties || 0,
                          "text-signal-amber",
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Season Stats Section — career totals + every (league, season) row from
                  `GET /stats/player/:id/seasons`. The data is keyed by
                  (player, league, season) and the simulator writes it inside
                  its atomic simulation transaction; this card just reads it.
                  Rendered as a separate card so the page's "career numbers"
                  visual block sits apart from the skill bars (which are
                  about attributes, not what the player has done on the
                  pitch). */}
              <div className="px-6 pb-6 border-t border-edge/20">
                <PlayerSeasonStatsCard
                  playerId={parseInt(resolvedParams?.id ?? "0", 10)}
                />
              </div>

              {/* Player Events Section */}
              <div className="px-6 pb-6 border-t border-edge/20">
                <div className="flex items-center gap-2 mt-4 mb-3">
                  <div className="w-1.5 h-4 bg-signal-amber rounded-full" />
                  <h3 className="text-xs font-black font-space tracking-widest uppercase text-muted">
                    {te("title")}
                  </h3>
                </div>
                {events.length === 0 ? (
                  <div className="bg-ink-700/50 rounded-xl p-6 text-center">
                    <AppIcon name="history" className="text-3xl text-faint" />
                    <p className="text-faint text-xs mt-2">
                      {te("no_events")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event) => {
                      const iconName = EVENT_ICONS[event.eventType] || "event";
                      const colorClass =
                        EVENT_COLORS[event.eventType] || "text-accent";
                      const eventLabel = event.titleKey
                        ? te(event.titleKey.replace(/^player_events\./, ""))
                        : event.eventType;
                      const eventDate = new Date(event.date);
                      const dateStr = `${eventDate.getFullYear()}/${eventDate.getMonth() + 1}/${eventDate.getDate()}`;

                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 p-3 bg-ink-700/30 rounded-lg"
                        >
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center bg-ink-700 ${colorClass}`}
                          >
                            <AppIcon name={iconName} className="text-lg" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-frost">
                              {eventLabel}
                            </p>
                            <p className="text-xs text-muted">
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
            <p className="text-muted text-lg">
              {t("states.playerNotFound")}
            </p>
            <Link
              href={`/${resolvedParams?.locale}/teams/squad`}
              className="inline-flex items-center gap-2 text-accent hover:text-accent-hover transition-colors mt-4 text-sm font-bold"
            >
              <AppIcon name="arrow_back" className="text-lg" />
              {t("states.backToSquad")}
            </Link>
          </div>
        )}
      </div>

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
              const playerId = parseInt(resolvedParams.id, 10);
              if (!Number.isNaN(playerId)) {
                api.players.getById(playerId).then(setPlayer);
              }
            }
          }}
        />
      )}
    </div>
  );
}
