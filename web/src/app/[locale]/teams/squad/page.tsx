"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player } from "@/lib/api";

const SKILL_MAX = 20;

const SPECIALTIES: { value: string; label: string; labelEn: string }[] = [
  { value: "HEADER", label: "头球专家", labelEn: "Header" },
  { value: "LPASS", label: "长传手", labelEn: "Long Pass" },
  { value: "CROSS", label: "传中专家", labelEn: "Cross" },
  { value: "DRBLE", label: "盘带大师", labelEn: "Dribble" },
  { value: "LSHT", label: "远射", labelEn: "Long Shot" },
  { value: "CLUCH", label: "关键先生", labelEn: "Clutch" },
  { value: "TACKL", label: "抢断大师", labelEn: "Tackle" },
  { value: "PSAVE", label: "点球门将", labelEn: "PK Saver" },
  { value: "CNTR", label: "反击启动", labelEn: "Counter" },
  { value: "REBND", label: "补射专家", labelEn: "Rebound" },
  { value: "FSTRT", label: "快发", labelEn: "Fast Start" },
];

interface ListPlayerModalProps {
  player: Player;
  onClose: () => void;
  onSuccess: () => void;
}

function ListPlayerModal({ player, onClose, onSuccess }: ListPlayerModalProps) {
  const t = useTranslations();
  const [startPrice, setStartPrice] = useState<string>("");
  const [buyoutPrice, setBuyoutPrice] = useState<string>("");
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
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm bg-gradient-to-b from-[#0a1a14] to-[#001e17] rounded-2xl border border-[#2f4e44]/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4">
          <div className="absolute inset-0 bg-gradient-to-r from-[#a1ffc2]/5 to-transparent pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#a1ffc2]">
                  sell
                </span>
              </div>
              <div>
                <h3 className="text-lg font-black font-space text-[#d3f5e8]">
                  {t("squad.transfer.listPlayer")}
                </h3>
                <p className="text-[10px] text-[#91b2a6] font-space uppercase tracking-wider">
                  Set your auction terms
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#002c22] transition-colors"
            >
              <span className="material-symbols-outlined text-[#91b2a6] text-lg">
                close
              </span>
            </button>
          </div>
        </div>

        {/* Player Card */}
        <div className="mx-6 mt-4 mb-4 p-4 bg-[#00251c]/80 rounded-xl border border-[#2f4e44]/20">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-space font-black text-lg text-[#a1ffc2]"
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#91b2a6] mb-1.5">
                {t("squad.transfer.startPrice")}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91b2a6] text-sm font-space">
                  €
                </span>
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
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#91b2a6] mb-1.5">
                {t("squad.transfer.buyoutPrice")}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#91b2a6] text-sm font-space">
                  €
                </span>
                <input
                  type="number"
                  value={buyoutPrice}
                  onChange={(e) => setBuyoutPrice(e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full bg-[#001a12] border border-[#2f4e44]/40 rounded-lg pl-7 pr-3 py-2.5 text-[#d3f5e8] font-space text-sm placeholder:text-[#4a7a6a] focus:outline-none focus:border-[#a1ffc2]/60 transition-colors"
                />
              </div>
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
                <span className="material-symbols-outlined text-lg animate-spin">
                  progress_activity
                </span>
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

export default function SquadPage() {
  const t = useTranslations();
  const { user, team } = useAuth();
  const params = useParams();
  const locale = params.locale as string;
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [filter, setFilter] = useState<"all" | "GK" | "outfield">("all");
  const [showListModal, setShowListModal] = useState(false);

  useEffect(() => {
    if (!team?.id) return;

    setIsLoading(true);
    api.players
      .getByTeam(team.id)
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
  }, [team?.id]);

  const filteredPlayers = players.filter((p) => {
    if (filter === "GK") return p.isGoalkeeper;
    if (filter === "outfield") return !p.isGoalkeeper;
    return true;
  });

  // Small circle for list (stamina/form range 0-5.99)
  const renderMiniCircle = (value: number) => {
    const color = value >= 4 ? "#a1ffc2" : value >= 2 ? "#abf853" : "#ef4444";
    const percentage = (value / 5.99) * 100;
    const dashOffset = (percentage / 100) * (2 * Math.PI * 10);
    return (
      <div className="relative w-6 h-6">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 24 24">
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="transparent"
            stroke="#00251c"
            strokeWidth="2.5"
          />
          <circle
            cx="12"
            cy="12"
            r="10"
            fill="transparent"
            stroke={color}
            strokeWidth="2.5"
            strokeDasharray={`${2 * Math.PI * 10}`}
            strokeDashoffset={`${2 * Math.PI * 10 - dashOffset}`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-black text-white">
          {Math.round(value)}
        </span>
      </div>
    );
  };

  // Circular gauge component for detail panel
  const renderGauge = (
    value: number,
    max: number,
    label: string,
    colorClass: string,
    bgColor: string = "#00251c",
  ) => {
    const percentage = (value / max) * 100;
    const circumference = 2 * Math.PI * 20;
    const offset = circumference - (percentage / 100) * circumference;

    return (
      <div className="bg-[#00251c] rounded-xl p-3 flex flex-col items-center justify-center border border-[#2f4e44]/10">
        <div className="relative w-11 h-11 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90">
            <circle
              className={bgColor}
              cx="22"
              cy="22"
              fill="transparent"
              r="20"
              stroke="currentColor"
              strokeWidth="3"
            />
            <circle
              className={colorClass}
              cx="22"
              cy="22"
              fill="transparent"
              r="20"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute text-sm font-black font-space">
            {value}
          </span>
        </div>
        <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-[#91b2a6]">
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
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#91b2a6]">
          <span>{label}</span>
          <span className={colorClass}>
            {value}/{potential}
          </span>
        </div>
        <div className="h-1.5 w-full bg-[#00251c] rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClass.replace("text-", "bg-")} rounded-full`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };

  const getStatusBadge = (player: Player) => {
    if (player.stamina >= 7) {
      return {
        label: t("squad.status.matchReady"),
        class: "bg-[#3e6a00]/30 text-[#abf853]",
      };
    }
    if (player.stamina >= 4) {
      return {
        label: t("squad.status.fatigued"),
        class: "bg-amber-500/30 text-amber-400",
      };
    }
    return {
      label: t("squad.status.lowEnergy"),
      class: "bg-red-500/30 text-red-400",
    };
  };

  return (
    <div className="flex min-h-screen bg-[#00110c]">
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col overflow-hidden">
        {/* Header Section */}
        <Header title={t("squad.title")} />

        {/* Content Area */}
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

              {/* Left Column: Player List */}
              <div className="w-[600px] max-w-[42%] shrink-0 flex flex-col gap-4 overflow-hidden">
                <div className="bg-[#001e17] rounded-xl flex flex-col overflow-hidden h-full">
                  {/* List Header */}
                  <div className="grid grid-cols-12 px-4 py-3 border-b border-[#2f4e44]/10 text-[10px] font-bold font-space text-[#91b2a6] uppercase tracking-wider">
                    <div className="col-span-4">{t("squad.players")}</div>
                    <div className="col-span-1 text-center">{t("squad.age")}</div>
                    <div className="col-span-2 text-center">{locale === "zh" ? "体能" : "STA"}</div>
                    <div className="col-span-2 text-center">{locale === "zh" ? "状态" : "FRM"}</div>
                    <div className="col-span-2 text-center">PWI</div>
                    <div className="col-span-1 text-center">{locale === "zh" ? "特技" : "SPC"}</div>
                  </div>

                  {/* List Content */}
                  <div className="flex-grow overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {filteredPlayers.map((player, idx) => {
                      const isSelected = selectedPlayer?.id === player.id;
                      const initials = player.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2);
                      const isLast = idx === filteredPlayers.length - 1;

                      return (
                        <div
                          key={player.id}
                          onClick={() => setSelectedPlayer(player)}
                          className={`grid grid-cols-12 items-center px-4 py-3 rounded-lg transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-[#002c22] border-l-4 border-[#a1ffc2]"
                              : "hover:bg-[#00251c]"
                          } ${!isLast ? "mb-1" : ""}`}
                        >
                          <div className="col-span-4 flex items-center gap-2">
                            <div
                              className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px] text-[#a1ffc2]"
                              style={{ backgroundColor: "#00251c" }}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/${locale}/players/${player.id}`}
                                  className="text-[12px] font-bold text-[#d3f5e8] truncate hover:text-[#a1ffc2] transition-colors"
                                >
                                  {player.name}
                                </Link>
                                {player.onTransfer && (
                                  <span className="px-1.5 py-0.5 bg-[#a1ffc2]/20 text-[#a1ffc2] text-[8px] font-bold rounded">
                                    {t("squad.transfer.listed")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="col-span-1 text-[11px] font-space text-[#d3f5e8] text-center">
                            {player.age}y
                          </div>
                          <div className="col-span-2 flex justify-center">
                            {renderMiniCircle(player.stamina)}
                          </div>
                          <div className="col-span-2 flex justify-center">
                            {renderMiniCircle(player.form)}
                          </div>
                          <div className="col-span-2 text-center">
                            <span className="text-[10px] font-black text-[#a1ffc2] block">
                              {player.pwi?.toLocaleString() || "0"}
                            </span>
                          </div>
                          <div className="col-span-1 flex justify-center">
                            {player.specialty ? (() => {
                              const specInfo = SPECIALTIES.find((s) => s.value === player.specialty);
                              if (!specInfo) return <span className="text-[10px] text-[#4a7a6a]">-</span>;
                              return (
                                <span className="text-[9px] font-bold text-[#a1ffc2]">
                                  {locale === "zh" ? specInfo.label : specInfo.labelEn}
                                </span>
                              );
                            })() : (
                              <span className="text-[10px] text-[#4a7a6a]">-</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Gap */}
              <div className="w-6 shrink-0" />

              {/* Right Column: Player Profile Detail */}
              <div className="w-[600px] max-w-[60%] shrink-0 flex flex-col gap-6 overflow-hidden">
                <div className="bg-[#001e17] rounded-xl h-full flex flex-col overflow-hidden relative">
                  {/* Glass Background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#a1ffc2]/5 to-transparent pointer-events-none" />

                  {selectedPlayer ? (
                    <>
                      {/* Player Header Section */}
                      <div className="p-6 pb-4 relative flex items-start justify-between">
                        <div className="flex gap-8">
                          {/* Avatar with Badge */}
                          <div className="relative">
                            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#a1ffc2]/30 p-1 bg-[#002c22]">
                              <div
                                className="w-full h-full rounded-xl flex items-center justify-center font-space font-black text-3xl text-[#a1ffc2]"
                                style={{
                                  background: `linear-gradient(135deg, ${team?.jerseyColorPrimary || "#a1ffc2"}30, ${team?.jerseyColorPrimary || "#a1ffc2"}10)`,
                                }}
                              >
                                {selectedPlayer.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)}
                              </div>
                            </div>
                          </div>

                          {/* Name & Bio */}
                          <div>
                            <Link
                              href={`/${locale}/players/${selectedPlayer.id}`}
                            >
                              <h2 className="text-4xl font-black font-space tracking-tight leading-none text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors">
                                {selectedPlayer.name}
                              </h2>
                            </Link>
                            <div className="flex items-center gap-4 mt-3">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#91b2a6] text-sm">
                                  calendar_month
                                </span>
                                <span className="text-xs font-bold uppercase tracking-widest text-[#91b2a6]">
                                  {selectedPlayer.age}y {selectedPlayer.ageDays}
                                  d
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#91b2a6] text-sm">
                                  military_tech
                                </span>
                                <span className="text-xs font-bold uppercase tracking-widest text-[#91b2a6]">
                                  {t("squad.exp")} {selectedPlayer.experience}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#91b2a6] text-sm">
                                  payments
                                </span>
                                <span className="text-xs font-bold uppercase tracking-widest text-[#f59e0b]">
                                  £
                                  {(
                                    selectedPlayer.currentWage || 0
                                  ).toLocaleString()}
                                  /w
                                </span>
                              </div>
                            </div>
                            <div className="mt-4 flex gap-2">
                              <span className="bg-[#3e6a00]/20 text-[#abf853] px-3 py-1 rounded-full text-[10px] font-bold font-space">
                                {selectedPlayer.potentialTier.replace("_", " ")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {!selectedPlayer.onTransfer && (
                            <button
                              onClick={() => setShowListModal(true)}
                              className="w-10 h-10 rounded-full flex items-center justify-center bg-[#a1ffc2]/20 text-[#a1ffc2] hover:bg-[#a1ffc2]/30 transition-colors border border-[#a1ffc2]/30"
                              title={t("squad.transfer.listButton")}
                            >
                              <span className="material-symbols-outlined">
                                sell
                              </span>
                            </button>
                          )}
                          <button className="w-10 h-10 rounded-full flex items-center justify-center bg-[#002c22] text-[#91b2a6] hover:text-[#a1ffc2] transition-colors border border-[#2f4e44]/20">
                            <span className="material-symbols-outlined">
                              favorite
                            </span>
                          </button>
                          <button className="w-10 h-10 rounded-full flex items-center justify-center bg-[#002c22] text-[#91b2a6] hover:text-[#a1ffc2] transition-colors border border-[#2f4e44]/20">
                            <span className="material-symbols-outlined">
                              share
                            </span>
                          </button>
                        </div>
                      </div>

                      {/* Gauges Area */}
                      <div className="px-6 py-8 grid grid-cols-4 gap-3">
                        {/* PWI - Simple text display */}
                        <div className="bg-[#00251c] rounded-xl p-3 flex flex-col items-center justify-center border border-[#2f4e44]/10">
                          <div className="text-xl font-black font-space text-[#a1ffc2]">
                            {selectedPlayer.pwi?.toLocaleString() || "0"}
                          </div>
                          <span className="text-[8px] font-bold font-space mt-1 tracking-widest uppercase text-[#91b2a6]">
                            PWI
                          </span>
                        </div>
                        {renderGauge(
                          selectedPlayer.stamina,
                          5.99,
                          t("squad.stamina"),
                          selectedPlayer.stamina >= 4
                            ? "text-[#a1ffc2]"
                            : selectedPlayer.stamina >= 2
                              ? "text-[#abf853]"
                              : "text-red-400",
                        )}
                        {renderGauge(
                          selectedPlayer.form,
                          5.99,
                          t("squad.form"),
                          selectedPlayer.form >= 4
                            ? "text-[#a1ffc2]"
                            : selectedPlayer.form >= 2
                              ? "text-[#abf853]"
                              : "text-red-400",
                        )}
                        {renderGauge(
                          selectedPlayer.potentialAbility,
                          99,
                          t("squad.potential"),
                          "text-[#00ec90]",
                        )}
                      </div>

                      {/* Transfer Info Section */}
                      {selectedPlayer.onTransfer && (
                        <div className="px-6 pb-4">
                          <div className="bg-[#002c22] rounded-xl p-4 border border-[#a1ffc2]/20">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="material-symbols-outlined text-[#a1ffc2]">
                                sell
                              </span>
                              <h4 className="text-xs font-black font-space tracking-widest uppercase text-[#a1ffc2]">
                                {t("squad.transfer.onTransfer")}
                              </h4>
                            </div>
                            <p className="text-[10px] text-[#91b2a6]">
                              {t("squad.transfer.onTransferDesc")}
                            </p>
                          </div>
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
                                <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">
                                  {t("squad.skills.physicalAttributes")}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                {renderSkillBar(
                                  t("squad.skills.pace"),
                                  selectedPlayer.currentSkills.physical?.pace ||
                                    0,
                                  selectedPlayer.potentialSkills.physical
                                    ?.pace || 0,
                                  "text-[#a1ffc2]",
                                )}
                                {renderSkillBar(
                                  t("squad.skills.strength"),
                                  selectedPlayer.currentSkills.physical
                                    ?.strength || 0,
                                  selectedPlayer.potentialSkills.physical
                                    ?.strength || 0,
                                  "text-[#a1ffc2]",
                                )}
                              </div>
                            </div>

                            {/* Technical */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
                                <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">
                                  {selectedPlayer.isGoalkeeper
                                    ? t("squad.skills.goalkeeperSkills")
                                    : t("squad.skills.technicalSkills")}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                {selectedPlayer.isGoalkeeper ? (
                                  <>
                                    {renderSkillBar(
                                      t("squad.skills.reflexes"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.reflexes || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.reflexes || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                    {renderSkillBar(
                                      t("squad.skills.handling"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.handling || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.handling || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                    {renderSkillBar(
                                      t("squad.skills.aerial"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.aerial || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.aerial || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {renderSkillBar(
                                      t("squad.skills.finishing"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.finishing || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.finishing || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                    {renderSkillBar(
                                      t("squad.skills.passing"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.passing || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.passing || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                    {renderSkillBar(
                                      t("squad.skills.dribbling"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.dribbling || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.dribbling || 0,
                                      "text-[#a1ffc2]",
                                    )}
                                    {renderSkillBar(
                                      t("squad.skills.defending"),
                                      (
                                        selectedPlayer.currentSkills
                                          .technical as any
                                      )?.defending || 0,
                                      (
                                        selectedPlayer.potentialSkills
                                          .technical as any
                                      )?.defending || 0,
                                      "text-[#a1ffc2]",
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
                                <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                                <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">
                                  {t("squad.skills.mentalProfile")}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                {renderSkillBar(
                                  t("squad.skills.positioning"),
                                  selectedPlayer.currentSkills.mental
                                    ?.positioning || 0,
                                  selectedPlayer.potentialSkills.mental
                                    ?.positioning || 0,
                                  "text-[#abf853]",
                                )}
                                {renderSkillBar(
                                  t("squad.skills.composure"),
                                  selectedPlayer.currentSkills.mental
                                    ?.composure || 0,
                                  selectedPlayer.potentialSkills.mental
                                    ?.composure || 0,
                                  "text-[#abf853]",
                                )}
                              </div>
                            </div>

                            {/* Set Pieces */}
                            <div>
                              <div className="flex items-center gap-2 mb-3">
                                <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
                                <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#91b2a6]">
                                  {t("squad.skills.setPieces")}
                                </h3>
                              </div>
                              <div className="space-y-3">
                                {renderSkillBar(
                                  t("squad.skills.freeKicks"),
                                  selectedPlayer.currentSkills.setPieces
                                    ?.freeKicks || 0,
                                  selectedPlayer.potentialSkills.setPieces
                                    ?.freeKicks || 0,
                                  "text-[#abf853]",
                                )}
                                {renderSkillBar(
                                  t("squad.skills.penalties"),
                                  selectedPlayer.currentSkills.setPieces
                                    ?.penalties || 0,
                                  selectedPlayer.potentialSkills.setPieces
                                    ?.penalties || 0,
                                  "text-[#abf853]",
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-grow flex items-center justify-center">
                      <p className="text-[#91b2a6] text-sm">
                        {t("squad.selectPlayer")}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Spacer */}
              <div className="flex-1" />
            </>
          )}
        </div>
      </main>

      {/* List Player Modal */}
      {showListModal && selectedPlayer && (
        <ListPlayerModal
          player={selectedPlayer}
          onClose={() => setShowListModal(false)}
          onSuccess={() => {
            // Refresh players list
            if (team?.id) {
              api.players.getByTeam(team.id).then((data) => {
                const sorted = data.items.sort((a, b) => {
                  if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
                  if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
                  return b.overall - a.overall;
                });
                setPlayers(sorted);
                setSelectedPlayer(
                  sorted.find((p) => p.id === selectedPlayer.id) || null,
                );
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
