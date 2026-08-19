"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useEffect, useState, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player, type PlayerEvent, type Team } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";
import { RadarChart } from "@/components/player/RadarChart";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { getConditionText } from "@/lib/constants";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { getSpecialtyLabel } from "@/lib/specialties";

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

const POSITION_GROUPS = [
  { key: "GK" },
  { key: "OUT" },
];

interface ListPlayerModalProps {
  player: Player;
  onClose: () => void;
  onSuccess: () => void;
}

function ListPlayerModal({ player, onClose, onSuccess }: ListPlayerModalProps) {
  const t = useTranslations();
  const [startPrice, setStartPrice] = useState<string>("");
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
      // Buyout is a hidden v2 mechanic — auto-derive as 2× start.
      // See `players/[id]/page.tsx` ListPlayerModal for the matching
      // note; the backend DTO still requires a numeric value.
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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#0a1a14] to-[#001e17] rounded-2xl border border-[#2f4e44]/50 shadow-2xl overflow-hidden">
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-linear-to-r from-[#a1ffc2]/5 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#a1ffc2]">sell</span>
              </div>
              <div>
                <h3 className="text-lg font-black font-space text-[#d3f5e8]">
                  {t("squad.transfer.listPlayer")}
                </h3>
                <p className="text-[10px] text-[#91b2a6] font-space uppercase tracking-wider">
                  {t("squad.transfer.modalSubtitle")}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#002c22] transition-colors"
            >
              <span className="material-symbols-outlined text-[#91b2a6] text-lg">close</span>
            </button>
          </div>
        </div>

        <div className="mx-6 mt-4 mb-4 p-4 bg-[#00251c]/80 rounded-xl border border-[#2f4e44]/20">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-space font-black text-lg text-[#a1ffc2]"
              style={{ background: "linear-gradient(135deg, #a1ffc220, #a1ffc210)" }}
            >
              {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </div>
            <div>
              <p className="text-sm font-bold text-[#d3f5e8]">{player.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="px-2 py-0.5 bg-[#a1ffc2]/20 text-[#a1ffc2] text-[10px] font-bold rounded">
                  PWI {player.pwi?.toLocaleString() || "0"}
                </span>
                <span className="text-[10px] text-[#91b2a6] font-space">
                  {player.isGoalkeeper ? "GK" : ""}
                </span>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#91b2a6] mb-1.5">
              {t("squad.transfer.startPrice")}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91b2a6] text-sm font-space">€</span>
              <input
                type="number"
                value={startPrice}
                onChange={(e) => setStartPrice(e.target.value)}
                placeholder="0"
                min={0}
                className="w-full bg-[#001a12] border border-[#2f4e44]/40 rounded-lg pl-7 pr-3 py-2.5 text-[#d3f5e8] font-space text-sm placeholder:text-[#4a7a6a] focus:outline-none focus:border-[#a1ffc2]/60 transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 rounded-xl font-bold font-space text-sm transition-all bg-[#a1ffc2] hover:bg-[#8ee6b8] disabled:bg-[#2f4e44]/50 disabled:text-[#91b2a6] text-[#00110c]"
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                {t("transfers.submitting")}
              </span>
            ) : (
              t("squad.transfer.listButton")
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function SquadPageContent() {
  const t = useTranslations();
  const te = useTranslations("player_events");
  const { user, team } = useAuth();
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = params.locale as string;

  const { viewTeamId, setViewTeam, teamId } = useGameStore();

  useEffect(() => {
    const urlTeamId = searchParams.get("team");
    if (urlTeamId && urlTeamId !== viewTeamId) {
      setViewTeam(urlTeamId);
    }
  }, []);

  const myTeam = viewTeamId === null || viewTeamId === teamId;
  const currentTeamId = myTeam ? teamId : viewTeamId;
  const isViewingMyTeam = myTeam;

  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [playerEvents, setPlayerEvents] = useState<PlayerEvent[]>([]);
  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);
  const [showListModal, setShowListModal] = useState(false);

  useEffect(() => {
    if (myTeam) {
      setViewedTeam(null);
      return;
    }
    if (viewTeamId) {
      api.teams.getById(viewTeamId).then(setViewedTeam).catch(() => setViewedTeam(null));
    }
  }, [viewTeamId, myTeam]);

  const displayTeam = isViewingMyTeam ? team : viewedTeam;

  useEffect(() => {
    if (!currentTeamId) return;

    setIsLoading(true);
    api.players
      .getByTeam(currentTeamId, isViewingMyTeam)
      .then((data) => {
        const sorted = data.items.sort((a, b) => {
          if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
          if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
          return b.overall - a.overall;
        });
        setPlayers(sorted);
        if (sorted.length > 0) {
          setSelectedPlayer(sorted[0]);
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [currentTeamId, isViewingMyTeam]);

  useEffect(() => {
    if (!selectedPlayer) {
      setPlayerEvents([]);
      return;
    }
    api.players.getEvents(selectedPlayer.id).then(setPlayerEvents).catch(console.error);
  }, [selectedPlayer?.id]);

  // Group players by position for formation-based display
  const groupedPlayers = React.useMemo(() => {
    const groups: Record<string, Player[]> = {
      GK: [],
      OUT: [],
    };

    players.forEach((player) => {
      if (player.isGoalkeeper) {
        groups.GK.push(player);
      } else {
        groups.OUT.push(player);
      }
    });

    return groups;
  }, [players]);

  // Build radar chart data from player skills
  const getRadarData = (player: Player) => {
    if (!player.currentSkills) return null;

    const current = player.currentSkills;
    const potential = player.potentialSkills || current;


    // Radar chart labels come from the `squad.skills.*` i18n keys — single
    // source of truth shared with the SkillRow labels below.
    const getLabel = (key: string) => t(`squad.skills.${key}`);

    if (player.isGoalkeeper) {
      const gkLabels = ["pace", "strength", "reflexes", "handling", "aerial", "positioning", "freeKicks", "penalties"];
      return {
        labels: gkLabels.map(getLabel),
        currentValues: [
          current.physical?.pace || 0,
          current.physical?.strength || 0,
          (current.technical as any)?.reflexes || 0,
          (current.technical as any)?.handling || 0,
          (current.technical as any)?.aerial || 0,
          current.mental?.positioning || 0,
          current.setPieces?.freeKicks || 0,
          current.setPieces?.penalties || 0,
        ],
        potentialValues: [
          potential.physical?.pace || 0,
          potential.physical?.strength || 0,
          (potential.technical as any)?.reflexes || 0,
          (potential.technical as any)?.handling || 0,
          (potential.technical as any)?.aerial || 0,
          potential.mental?.positioning || 0,
          potential.setPieces?.freeKicks || 0,
          potential.setPieces?.penalties || 0,
        ],
        maxValue: 20,
      };
    }

    const outfieldLabels = ["finishing", "passing", "dribbling", "defending", "pace", "strength", "positioning", "composure", "freeKicks", "penalties"];
    return {
      labels: outfieldLabels.map(getLabel),
      currentValues: [
        (current.technical as any)?.finishing || 0,
        (current.technical as any)?.passing || 0,
        (current.technical as any)?.dribbling || 0,
        (current.technical as any)?.defending || 0,
        current.physical?.pace || 0,
        current.physical?.strength || 0,
        current.mental?.positioning || 0,
        current.mental?.composure || 0,
        current.setPieces?.freeKicks || 0,
        current.setPieces?.penalties || 0,
      ],
      potentialValues: [
        (potential.technical as any)?.finishing || 0,
        (potential.technical as any)?.passing || 0,
        (potential.technical as any)?.dribbling || 0,
        (potential.technical as any)?.defending || 0,
        potential.physical?.pace || 0,
        potential.physical?.strength || 0,
        potential.mental?.positioning || 0,
        potential.mental?.composure || 0,
        potential.setPieces?.freeKicks || 0,
        potential.setPieces?.penalties || 0,
      ],
      maxValue: 20,
    };
  };

  return (
    <div>
      <div className="flex-grow flex p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full w-full">
            <span className="material-symbols-outlined text-4xl text-[#a1ffc2] animate-spin">
              progress_activity
            </span>
          </div>
        ) : (
          <>
            {/* Left Spacer */}
            <div className="flex-1" />

            {/* Left Column: Formation-Based Player List */}
            <div className="w-[580px] max-w-[43%] shrink-0 flex flex-col gap-4">
              <div className="bg-[#001e17] rounded-xl flex flex-col h-full">
                {/* List Header */}
                <div className="px-4 py-3 border-b border-[#2f4e44]/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#a1ffc2] text-lg">groups</span>
                      <span className="text-sm font-black font-space text-[#d3f5e8] uppercase tracking-wider">
                        {displayTeam?.name || t("squad.squad")}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#91b2a6] font-space">
                      {players.length} {t("squad.players")}
                    </span>
                  </div>
                </div>

                {/* List Content - Formation Groups */}
                <div className="flex-grow overflow-y-auto custom-scrollbar">
                  {POSITION_GROUPS.map((group) => {
                    const groupPlayers = groupedPlayers[group.key];
                    if (groupPlayers.length === 0) return null;

                    return (
                      <div key={group.key} className="border-b border-[#2f4e44]/5 last:border-b-0">
                        {/* Position Group Header */}
                        <div className="sticky top-0 z-10 bg-[#001a12]/95 backdrop-blur-sm px-4 py-2 flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            group.key === "GK" ? "bg-[#fbbf24]" : "bg-[#a1ffc2]"
                          }`} />
                          <span className="text-[10px] font-bold font-space uppercase tracking-widest text-[#91b2a6]">
                            {t(group.key === "GK" ? "squad.gk" : "squad.field")}
                          </span>
                          <span className="text-[10px] text-[#4a7a6a] font-space">
                            ({groupPlayers.length})
                          </span>
                        </div>

                        {/* Players in this group */}
                        {groupPlayers.map((player) => {
                          const isSelected = selectedPlayer?.id === player.id;
                          const initials = player.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2);

                          return (
                            <div
                              key={player.id}
                              onClick={() => setSelectedPlayer(player)}
                              className={`group relative mx-3 mb-2 rounded-xl cursor-pointer transition-all duration-200 ease-out border-l-2 ${
                                isSelected
                                  ? "bg-[#002c22] border-[#a1ffc2] shadow-[inset_0_0_24px_rgba(161,255,194,0.10)]"
                                  : "bg-transparent border-transparent hover:bg-[#00251c]/70 hover:border-[#a1ffc2]/40 hover:shadow-[inset_0_0_18px_rgba(161,255,194,0.06)]"
                              }`}
                            >
                              {/* Subtle hover sheen — slides in from the left */}
                              <div
                                className={`absolute inset-y-0 left-0 w-1 transition-all duration-200 ease-out ${
                                  isSelected
                                    ? "bg-gradient-to-r from-[#a1ffc2]/40 to-transparent opacity-100"
                                    : "opacity-0 group-hover:opacity-100 bg-gradient-to-r from-[#a1ffc2]/30 to-transparent"
                                }`}
                              />
                              <div className="relative px-4 py-3.5">
                                <div className="flex items-center gap-4">
                                  {/* Avatar Circle */}
                                  <div
                                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-all duration-200 ${
                                      isSelected
                                        ? "bg-[#a1ffc2]/20 text-[#a1ffc2] scale-105 ring-2 ring-[#a1ffc2]/30"
                                        : "bg-[#00251c] text-[#91b2a6] group-hover:bg-[#003328] group-hover:text-[#d3f5e8]"
                                    }`}
                                  >
                                    {initials}
                                  </div>

                                  {/* Player Info */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <Link
                                        href={`/${locale}/players/${player.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-sm font-bold text-[#d3f5e8] truncate hover:text-[#a1ffc2] transition-colors"
                                      >
                                        {player.name}
                                      </Link>
                                      {player.onTransfer && (
                                        <span
                                          className="material-symbols-outlined text-[#a1ffc2] text-xs"
                                          title={t("squad.transfer.listed")}
                                        >
                                          sell
                                        </span>
                                      )}
                                      {player.coreSpecialty ? (
                                        <span
                                          className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${
                                            player.coreSpecialtyTier === 'GOLD'
                                              ? 'text-amber-300'
                                              : player.coreSpecialtyTier === 'SILVER'
                                              ? 'text-slate-300'
                                              : 'text-stone-400'
                                          }`}
                                        >
                                          <SpecialtyIcon
                                            code={player.coreSpecialty}
                                            tier={player.coreSpecialtyTier}
                                            size="lg"
                                          />
                                          <span className="max-w-0 group-hover:max-w-[140px] opacity-0 group-hover:opacity-100 ml-0 group-hover:ml-0.5 overflow-hidden transition-all duration-200 ease-out whitespace-nowrap">
                                            {getSpecialtyLabel(player.coreSpecialty, locale === "en" ? "en" : "zh")}
                                          </span>
                                        </span>
                                      ) : null}
                                      <InjuryBadge
                                        player={player}
                                        estimatedDays={Math.ceil(
                                          (player.currentInjuryValue ?? 0) / 8,
                                        )}
                                      />
                                    </div>

                                    {/* Stats row — always visible */}
                                    <div className="grid grid-cols-5 gap-4 text-xs font-space mt-1.5">
                                      <span className="truncate">
                                        <span className="text-[#4a7a6a] uppercase">{t("squad.stamina")} </span>
                                        <span
                                          className={`font-bold ${
                                            player.stamina >= 4
                                              ? "text-[#a1ffc2]"
                                              : player.stamina >= 2
                                              ? "text-[#abf853]"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {getConditionText(player.stamina, locale).text}
                                        </span>
                                      </span>
                                      <span className="truncate">
                                        <span className="text-[#4a7a6a] uppercase">{t("squad.form")} </span>
                                        <span
                                          className={`font-bold ${
                                            player.form >= 4
                                              ? "text-[#a1ffc2]"
                                              : player.form >= 2
                                              ? "text-[#abf853]"
                                              : "text-red-400"
                                          }`}
                                        >
                                          {getConditionText(player.form, locale).text}
                                        </span>
                                      </span>
                                      <span className="truncate">
                                        <span className="text-[#4a7a6a] uppercase">{t("squad.age")} </span>
                                        <span className="font-bold text-[#d3f5e8]">
                                          {t("common.ageFormat", { y: player.age, d: player.ageDays })}
                                        </span>
                                      </span>
                                      <span className="truncate">
                                        <span className="text-[#4a7a6a] uppercase">{t("squad.exp")} </span>
                                        <span className="font-bold text-[#d3f5e8]">{player.experience || 0}</span>
                                      </span>
                                      <span className="truncate">
                                        <span className="text-[#4a7a6a]">PWI </span>
                                        <span className="font-bold text-[#a1ffc2]">
                                          {player.pwi?.toLocaleString() || "0"}
                                        </span>
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Gap */}
            <div className="w-6 shrink-0" />

            {/* Right Column: Player Profile Detail */}
            <div className="w-[700px] max-w-[57%] shrink-0 flex flex-col gap-6">
              <div className="bg-[#001e17] rounded-xl h-full flex flex-col relative">
                {/* Glass Background */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#a1ffc2]/3 via-transparent to-transparent pointer-events-none" />

                {selectedPlayer ? (
                  <>
                    {/* Hero Section */}
                    <div className="p-8 pb-6 relative">
                      <div className="flex items-start gap-8">
                        {/* Avatar Hero */}
                        <div className="relative shrink-0">
                          <div
                            className="w-36 h-36 rounded-2xl overflow-hidden border-2 border-[#a1ffc2]/20 p-1.5"
                            style={{
                              background: `linear-gradient(135deg, ${displayTeam?.jerseyColorPrimary || "#a1ffc2"}30, ${displayTeam?.jerseyColorPrimary || "#a1ffc2"}10)`,
                            }}
                          >
                            <div className="w-full h-full rounded-xl bg-[#00251c] flex items-center justify-center">
                              <span className="text-5xl font-black font-space text-[#a1ffc2] leading-none uppercase">
                                {selectedPlayer.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Player Info */}
                        <div className="flex-1 min-w-0 pt-4">
                          <div className="flex items-center gap-3">
                            <Link href={`/${locale}/players/${selectedPlayer.id}`}>
                              <h2 className="text-4xl font-black font-space tracking-tight leading-none text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors">
                                {selectedPlayer.name}
                              </h2>
                            </Link>
                            {selectedPlayer.coreSpecialty && (
                              <span
                                className={`inline-flex items-center ${
                                  selectedPlayer.coreSpecialtyTier === "GOLD"
                                    ? "text-amber-300"
                                    : selectedPlayer.coreSpecialtyTier === "SILVER"
                                      ? "text-slate-300"
                                      : "text-stone-400"
                                }`}
                              >
                                <SpecialtyIcon
                                  code={selectedPlayer.coreSpecialty}
                                  tier={selectedPlayer.coreSpecialtyTier}
                                  size="xl"
                                />
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-6 mt-4 text-sm font-space">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[#91b2a6]">calendar_month</span>
                              <span className="text-[#91b2a6]">
                                {t("squad.age")}{" "}
                                <span className="font-bold text-[#d3f5e8]">
                                  {t("common.ageFormat", { y: selectedPlayer.age, d: selectedPlayer.ageDays })}
                                </span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[#91b2a6]">military_tech</span>
                              <span className="text-[#91b2a6]">
                                {t("squad.exp")} <span className="font-bold text-[#d3f5e8]">{selectedPlayer.experience || 0}</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-[#91b2a6]">payments</span>
                              <span className="font-bold text-[#f59e0b]">
                                £{(selectedPlayer.currentWage || 0).toLocaleString()}/w
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-4">
                          {isViewingMyTeam && !selectedPlayer.onTransfer && (
                            <button
                              onClick={() => setShowListModal(true)}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-[#a1ffc2]/20 text-[#a1ffc2] hover:bg-[#a1ffc2]/30 transition-colors border border-[#a1ffc2]/30"
                              title={t("squad.transfer.listButton")}
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
                    </div>

                    {/* Quick Stats Row */}
                    <div className="px-6 pb-4 flex gap-3">
                      <div className="flex-1 bg-[#00251c] rounded-xl p-3 border border-[#2f4e44]/10 flex items-center justify-center gap-4">
                        <div className="text-center">
                          <div className={`text-xl font-black font-space ${
                            selectedPlayer.stamina >= 4 ? "text-[#a1ffc2]" :
                            selectedPlayer.stamina >= 2 ? "text-[#abf853]" : "text-red-400"
                          }`}>
                            {Math.round(selectedPlayer.stamina)}
                          </div>
                          <div className="text-[8px] font-bold font-space text-[#91b2a6] uppercase tracking-widest mt-0.5">
                            {t("squad.stamina")}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-[#2f4e44]/30" />
                        <div className="text-center">
                          <div className={`text-xl font-black font-space ${
                            selectedPlayer.form >= 4 ? "text-[#a1ffc2]" :
                            selectedPlayer.form >= 2 ? "text-[#abf853]" : "text-red-400"
                          }`}>
                            {Math.round(selectedPlayer.form)}
                          </div>
                          <div className="text-[8px] font-bold font-space text-[#91b2a6] uppercase tracking-widest mt-0.5">
                            {t("squad.form")}
                          </div>
                        </div>
                        <div className="w-px h-8 bg-[#2f4e44]/30" />
                        <div className="text-center">
                          <div className="text-xl font-black font-space text-[#00ec90]">
                            {selectedPlayer.potentialAbility || 0}
                          </div>
                          <div className="text-[8px] font-bold font-space text-[#91b2a6] uppercase tracking-widest mt-0.5">
                            {t("squad.potential")}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Transfer Info */}
                    {selectedPlayer.onTransfer && (
                      <div className="px-6 pb-4">
                        <div className="bg-[#002c22] rounded-xl p-3 border border-[#a1ffc2]/20 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#a1ffc2] text-sm">sell</span>
                          <span className="text-xs font-bold text-[#a1ffc2]">{t("squad.transfer.onTransfer")}</span>
                        </div>
                      </div>
                    )}

                    {/* Skills Radar Section */}
                    {selectedPlayer.currentSkills && getRadarData(selectedPlayer) && (
                      <div className="flex-grow overflow-y-auto custom-scrollbar px-6 pb-6">
                        <div className="flex gap-8">
                          {/* Radar Chart */}
                          <div className="shrink-0 flex flex-col items-center">
                            <RadarChart
                              {...getRadarData(selectedPlayer)!}
                              size={180}
                              currentColor="#a1ffc2"
                              potentialColor="#2f4e44"
                              locale={locale}
                            />
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-[#a1ffc2]" />
                                <span className="text-[9px] font-bold font-space text-[#91b2a6] uppercase">{t("squad.radar.current")}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-[#2f4e44]" />
                                <span className="text-[9px] font-bold font-space text-[#91b2a6] uppercase">{t("squad.radar.potential")}</span>
                              </div>
                            </div>
                          </div>

                          {/* Skills Breakdown */}
                          <div className="flex-1 min-w-0">
                            {selectedPlayer.isGoalkeeper ? (
                              <>
                                {/* GK: pace, strength (2) + reflexes, handling, aerial (3) + positioning, composure (2) + freeKicks, penalties (2) = 9 */}
                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#60a5fa] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.physicalAttributes")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "pace" },
                                      { key: "strength" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.physical?.[skill.key as keyof typeof selectedPlayer.currentSkills.physical] || 0}
                                        potential={selectedPlayer.potentialSkills?.physical?.[skill.key as keyof typeof selectedPlayer.potentialSkills.physical] || 0}
                                        color="#60a5fa"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#a1ffc2] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.goalkeeperSkills")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "reflexes" },
                                      { key: "handling" },
                                      { key: "aerial" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={(selectedPlayer.currentSkills.technical as any)?.[skill.key] || 0}
                                        potential={(selectedPlayer.potentialSkills?.technical as any)?.[skill.key] || 0}
                                        color="#a1ffc2"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#abf853] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.mentalProfile")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "positioning" },
                                      { key: "composure" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.mental?.[skill.key as keyof typeof selectedPlayer.currentSkills.mental] || 0}
                                        potential={selectedPlayer.potentialSkills?.mental?.[skill.key as keyof typeof selectedPlayer.potentialSkills.mental] || 0}
                                        color="#abf853"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#f59e0b] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.setPieces")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "freeKicks" },
                                      { key: "penalties" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.setPieces?.[skill.key as keyof typeof selectedPlayer.currentSkills.setPieces] || 0}
                                        potential={selectedPlayer.potentialSkills?.setPieces?.[skill.key as keyof typeof selectedPlayer.potentialSkills.setPieces] || 0}
                                        color="#f59e0b"
                                      />
                                    ))}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                {/* Outfield: pace, strength (2) + finishing, passing, dribbling, defending (4) + positioning, composure (2) + freeKicks, penalties (2) = 10 */}
                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#60a5fa] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.physicalAttributes")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "pace" },
                                      { key: "strength" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.physical?.[skill.key as keyof typeof selectedPlayer.currentSkills.physical] || 0}
                                        potential={selectedPlayer.potentialSkills?.physical?.[skill.key as keyof typeof selectedPlayer.potentialSkills.physical] || 0}
                                        color="#60a5fa"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#a1ffc2] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.technicalSkills")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "finishing" },
                                      { key: "passing" },
                                      { key: "dribbling" },
                                      { key: "defending" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={(selectedPlayer.currentSkills.technical as any)?.[skill.key] || 0}
                                        potential={(selectedPlayer.potentialSkills?.technical as any)?.[skill.key] || 0}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="mb-4">
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#abf853] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.mentalProfile")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "positioning" },
                                      { key: "composure" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.mental?.[skill.key as keyof typeof selectedPlayer.currentSkills.mental] || 0}
                                        potential={selectedPlayer.potentialSkills?.mental?.[skill.key as keyof typeof selectedPlayer.potentialSkills.mental] || 0}
                                        color="#abf853"
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="w-1.5 h-3 bg-[#f59e0b] rounded-full" />
                                    <span className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                                      {t("squad.skills.setPieces")}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                                    {[
                                      { key: "freeKicks" },
                                      { key: "penalties" },
                                    ].map((skill) => (
                                      <SkillRow
                                        key={skill.key}
                                        labelKey={skill.key}
                                        current={selectedPlayer.currentSkills.setPieces?.[skill.key as keyof typeof selectedPlayer.currentSkills.setPieces] || 0}
                                        potential={selectedPlayer.potentialSkills?.setPieces?.[skill.key as keyof typeof selectedPlayer.potentialSkills.setPieces] || 0}
                                        color="#f59e0b"
                                      />
                                    ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Events Timeline */}
                        <div className="mt-6 pt-4 border-t border-[#2f4e44]/10">
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-1.5 h-3 bg-[#f59e0b] rounded-full" />
                            <h3 className="text-[10px] font-black font-space uppercase tracking-widest text-[#91b2a6]">
                              {t("player_events.title")}
                            </h3>
                          </div>
                          {playerEvents.length === 0 ? (
                            <div className="bg-[#00251c]/30 rounded-xl p-4 text-center">
                              <span className="material-symbols-outlined text-xl text-[#4a7a6a]">history</span>
                              <p className="text-[#4a7a6a] text-xs mt-1">{t("player_events.no_events")}</p>
                            </div>
                          ) : (
                            <div className="relative pl-4 border-l border-[#2f4e44]/30 space-y-2">
                              {playerEvents.slice(0, 5).map((event) => {
                                const iconName = EVENT_ICONS[event.eventType] || "event";
                                const colorClass = EVENT_COLORS[event.eventType] || "text-[#a1ffc2]";
                                const eventDate = new Date(event.date);
                                const dateStr = `${eventDate.getFullYear()}/${eventDate.getMonth() + 1}/${eventDate.getDate()}`;
                                return (
                                  <div key={event.id} className="flex items-center gap-3 relative">
                                    <div className={`absolute -left-[17px] w-2 h-2 rounded-full bg-[#00251c] border-2 border-[#4a7a6a]`} />
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center bg-[#00251c] ${colorClass}`}>
                                      <span className="material-symbols-outlined text-xs">{iconName}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-[11px] font-bold text-[#d3f5e8] truncate">
                                        {event.titleKey ? te(event.titleKey.replace(/^player_events\./, '')) : event.eventType}
                                      </p>
                                      <p className="text-[9px] text-[#4a7a6a]">S{event.season} · {dateStr}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-grow flex items-center justify-center">
                    <p className="text-[#91b2a6] text-sm">{t("squad.selectPlayer")}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Spacer */}
            <div className="flex-1" />
          </>
        )}
      </div>

      {/* List Player Modal */}
      {showListModal && selectedPlayer && (
        <ListPlayerModal
          player={selectedPlayer}
          onClose={() => setShowListModal(false)}
          onSuccess={() => {
            if (team?.id) {
              api.players.getByTeam(team.id, true).then((data) => {
                const sorted = data.items.sort((a, b) => {
                  if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
                  if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
                  return b.overall - a.overall;
                });
                setPlayers(sorted);
                setSelectedPlayer(sorted.find((p) => p.id === selectedPlayer.id) || null);
              });
            }
          }}
        />
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #002c22;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #00251c;
        }
      `}</style>
    </div>
  );
}

function SkillRow({ labelKey, current, potential, color = "#a1ffc2" }: { labelKey: string; current: number; potential: number; color?: string }) {
  const t = useTranslations();
  const currentPercent = (current / 20) * 100;
  const potentialPercent = (potential / 20) * 100;
  const isMaxed = current >= potential;
	  const barColor = color;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#91b2a6]">{t(`squad.skills.${labelKey}`)}</span>
        <span className={`text-[10px] font-black font-space ${isMaxed ? "text-[#a1ffc2]" : "text-[#d3f5e8]"}`}>
          {current}
          {!isMaxed && <span className="text-[#4a7a6a]">/{potential}</span>}
        </span>
      </div>
      <div className="h-1.5 w-full bg-[#00251c] rounded-full overflow-hidden relative">
        {/* Potential bar */}
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full bg-[#2f4e44]/50"
          style={{ width: `${potentialPercent}%` }}
        />
        {/* Current bar */}
        <div
          className="absolute inset-y-0 left-0 h-full rounded-full transition-all duration-500"
          style={{ width: `${currentPercent}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function SquadPage() {
  return (
    <Suspense fallback={<SquadPageLoading />}>
      <SquadPageContent />
    </Suspense>
  );
}

function SquadPageLoading() {
  return (
    <div className="flex items-center justify-center h-full w-full">
      <span className="material-symbols-outlined text-4xl text-[#a1ffc2] animate-spin">
        progress_activity
      </span>
    </div>
  );
}

export default function SquadPageWrapper() {
  return (
    <Suspense fallback={null}>
      <SquadPage />
    </Suspense>
  );
}

