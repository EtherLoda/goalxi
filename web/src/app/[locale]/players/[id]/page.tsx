"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { api, type Player } from "@/lib/api";
import { useTranslations } from "next-intl";

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

export default function PlayerDetailPage({ params }: PageProps) {
  const t = useTranslations("squad");
  const te = useTranslations("player_events");
  const [player, setPlayer] = useState<Player | null>(null);
  const [events, setEvents] = useState<PlayerEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedParams, setResolvedParams] = useState<{ locale: string; id: string } | null>(null);

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

  const getStatusBadge = (player: Player) => {
    if (player.stamina >= 7) {
      return { label: t("status.matchReady"), class: "bg-[#3e6a00]/30 text-[#abf853]" };
    }
    if (player.stamina >= 4) {
      return { label: t("status.fatigued"), class: "bg-amber-500/30 text-amber-400" };
    }
    return { label: t("status.lowEnergy"), class: "bg-red-500/30 text-red-400" };
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
            <div className="w-full max-w-[700px] mx-auto pb-8">
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

                {/* Status Badge */}
                <div className="px-6 pb-4">
                  {(() => {
                    const status = getStatusBadge(player);
                    return (
                      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${status.class}`}>
                        <span className="material-symbols-outlined text-sm">energy</span>
                        <span className="text-xs font-bold font-space">{status.label}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Transfer Info Section */}
                {player.onTransfer && (
                  <div className="px-6 pb-4">
                    <div className="bg-[#002c22] rounded-xl p-4 border border-[#a1ffc2]/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-[#a1ffc2]">sell</span>
                        <h4 className="text-xs font-black font-space tracking-widest uppercase text-[#a1ffc2]">
                          {t("transfer.onTransfer")}
                        </h4>
                      </div>
                      <p className="text-[10px] text-[#91b2a6]">
                        {t("transfer.onTransferDesc")}
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
                        const eventLabel = event.titleKey ? te(event.titleKey) : event.eventType;
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
    </div>
  );
}
