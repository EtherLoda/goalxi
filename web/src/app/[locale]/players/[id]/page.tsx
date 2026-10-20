"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Player, type PlayerEvent, type TransferAuction } from "@/lib/api";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { PlayerSeasonStatsCard } from "@/components/player/PlayerSeasonStatsCard";
import { PlayerIdentity } from "@/components/player/profile/PlayerIdentity";
import { PlayerStatTiles } from "@/components/player/profile/PlayerStatTiles";
import { PlayerSkillGrid } from "@/components/player/profile/PlayerSkillGrid";
import { PlayerSidebar } from "@/components/player/profile/PlayerSidebar";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
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
                <h3 className="text-lg font-black font-headline text-frost">
                  {t("squad.transfer.listPlayer")}
                </h3>
                <p className="text-[10px] text-muted font-headline uppercase tracking-wider">
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
              className="w-12 h-12 rounded-xl flex items-center justify-center font-headline font-black text-lg text-accent"
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
                <span className="text-[10px] text-muted font-headline">
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
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm font-headline">
                £
              </span>
              <input
                type="number"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-ink-850 border border-edge/40 rounded-lg pl-7 pr-3 py-2.5 text-frost font-headline text-sm placeholder:text-faint focus:outline-none focus:border-accent/60 transition-colors"
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
  const { team } = useAuth();
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

  return (
    <div>
      <div className="flex-grow p-6 pt-10">
        {isLoading ? (
          <div className="flex items-center justify-center h-full w-full">
            <AppIcon name="progress_activity" className="text-4xl text-accent animate-spin" />
          </div>
        ) : player ? (
          <div className="mx-auto grid w-full max-w-[1000px] items-start gap-panel pb-8 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="glass-panel flex flex-col overflow-hidden rounded-2xl">
              <PlayerIdentity
                player={player}
                locale={resolvedParams?.locale ?? "zh"}
                chips={
                  <>
                    {player.potentialTier ? (
                      <span className="rounded-md border border-outline-variant/40 bg-surface-container-high px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                        {player.potentialTier.replace("_", " ")}
                      </span>
                    ) : null}
                    {player.isGoalkeeper ? (
                      <span className="rounded-md border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-secondary">
                        {tt("status.goalkeeper")}
                      </span>
                    ) : null}
                    {player.onTransfer ? (
                      <span className="inline-flex items-center gap-micro rounded-md border border-secondary/30 bg-secondary/10 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-secondary">
                        <AppIcon name="sell" className="text-kicker" />
                        {tt("status.onTransfer")}
                      </span>
                    ) : null}
                    {player.isYouth ? (
                      <span className="rounded-md border border-tertiary/30 bg-tertiary/10 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-[0.08em] text-tertiary">
                        {tt("status.youth")}
                      </span>
                    ) : null}
                  </>
                }
                actions={
                  <>
                    {!player.onTransfer ? (
                      <button
                        type="button"
                        onClick={() => setShowListModal(true)}
                        className="inline-flex h-9 items-center gap-micro rounded-lg border border-primary/30 bg-primary/12 px-tight font-label text-label font-bold text-primary transition-colors duration-quick hover:bg-primary/20"
                      >
                        <AppIcon name="sell" className="text-kicker" />
                        {t("transfer.listButton")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/40 px-2.5 font-label text-label font-bold text-on-surface-variant transition-colors duration-quick hover:border-outline hover:text-on-surface"
                      aria-label={tc("favorite")}
                    >
                      <AppIcon name="favorite" className="text-kicker" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-outline-variant/40 px-2.5 font-label text-label font-bold text-on-surface-variant transition-colors duration-quick hover:border-outline hover:text-on-surface"
                      aria-label={tc("share")}
                    >
                      <AppIcon name="share" className="text-kicker" />
                    </button>
                  </>
                }
              />
              <div className="px-panel pb-panel">
                <PlayerStatTiles player={player} />
              </div>

              {/* Transfer Market Section */}
              {player.onTransfer && auction && (
                <div className="px-6 pb-4">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <AppIcon name="sell" className="text-accent" />
                      <h4 className="text-xs font-black font-headline tracking-widest uppercase text-accent">
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

              <PlayerSkillGrid player={player} columns={2} />
            </div>

            <aside className="flex min-w-0 flex-col">
              <PlayerSidebar events={events} />
            </aside>

            {/* Career numbers sit under both columns: the table needs the full
                width, and it is a different kind of fact from the attribute
                bars above it. */}
            <div className="md:col-span-2">
              <div className="glass-panel overflow-hidden rounded-2xl p-panel">
                <PlayerSeasonStatsCard
                  playerId={parseInt(resolvedParams?.id ?? "0", 10)}
                />
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