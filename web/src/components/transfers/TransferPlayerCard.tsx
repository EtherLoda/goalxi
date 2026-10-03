"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type TransferAuction, type Player } from "@/lib/api";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { getSpecialtyLabel } from "@/lib/specialties";
import { ExperienceTierLabel } from "@/components/ExperienceTierLabel";
import { useGameStore } from "@/stores/gameStore";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

interface TransferPlayerCardProps {
  transfer: TransferAuction;
  isSelected?: boolean;
  onClick?: () => void;
  formatCurrency: (value: number) => string;
  formatTimeRemaining: (expiresAt: string) => string;
  bidStatus?: "leading" | "outbid" | "won" | "lost";
}

const SKILL_MAX = 20;

// Skill-bar colors must match the player detail page
// (web/src/app/[locale]/players/[id]/page.tsx) and the transfer
// market right-side detail panel
// (web/src/app/[locale]/transfers/page.tsx):
//   - technical / GK  = #a1ffc2
//   - physical        = #60a5fa
//   - mental          = #abf853
//   - set pieces      = #f59e0b
// If you change one here, change all three.
function renderSkillBar(
  label: string,
  current: number,
  potential: number,
  colorClass: string,
) {
  const percentage = (current / SKILL_MAX) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className={colorClass}>
          {current}/{potential}
        </span>
      </div>
      <div className="h-1.5 w-full bg-ink-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass.replace("text-", "bg-")} rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function TransferPlayerCard({
  transfer,
  isSelected,
  onClick,
  formatCurrency,
  formatTimeRemaining,
  bidStatus,
}: TransferPlayerCardProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { team: userTeam } = useAuth();
  const { setViewTeam } = useGameStore();
  const player = transfer.player;
  const initials = player.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const timeLeft = formatTimeRemaining(transfer.expiresAt);
  const isExpired = timeLeft === t("transfers.expired");
  const skills = player.currentSkills;
  const potential = player.potentialSkills;
  const isGK = player.isGoalkeeper;

  // Mirror the league standings table behavior: clicking another
  // team's row switches the global `viewTeam` and navigates to the
  // dashboard in that team's context. Keeps the navbar/sidebar
  // consistent with the rest of the app when scouting a target.
  // (StandingsTable.tsx:32-36 has the canonical version.)
  const handleTeamClick = (clickedTeamId: string) => {
    const isOwnTeam = clickedTeamId === userTeam?.id;
    setViewTeam(isOwnTeam ? (userTeam?.id ?? null) : clickedTeamId);
    router.push(`/${locale}/dashboard?team=${clickedTeamId}`);
  };

  return (
    <div
      onClick={onClick}
      className={`bg-ink-900 rounded-2xl p-5 transition-all border ${
        onClick
          ? "cursor-pointer hover:border-edge/40 hover:bg-ink-800"
          : ""
      } ${
        isSelected
          ? "border-accent ring-1 ring-accent/30"
          : "border-edge/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-6 mb-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ink-600 to-ink-900 flex items-center justify-center font-bold text-2xl text-accent border border-edge/30">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <Link href={`/players/${player.id}`} className={`font-bold text-xl truncate hover:text-accent transition-colors ${isSelected ? "text-accent" : "text-frost"}`}>
              {player.name}
            </Link>
            <span
              className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
                isExpired
                  ? "bg-danger/20 text-red-400"
                  : "bg-ink-600 text-muted"
              }`}
            >
              {timeLeft}
            </span>
          </div>
          <p className="text-sm text-muted">
            {t("common.ageFormat", { y: player.age, d: player.ageDays })} ·{" "}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTeamClick(transfer.team.id);
              }}
              className="text-muted hover:text-accent transition-colors cursor-pointer"
            >
              {player.teamName || transfer.team.name}
            </button>{" "}
            · {t("common.currencySymbol")}
            {(player.currentWage || 0).toLocaleString()}{t("common.perWeek")}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              {t("squad.age")}
            </p>
            <p className="font-bold text-lg text-frost">{player.age}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              {t("squad.stamina")}
            </p>
            <p className="font-bold text-lg text-signal-lime">
              {player.stamina || 85}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              {t("squad.form")}
            </p>
            <p className="font-bold text-lg text-signal-amber">
              {player.form || 7.0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              {t("squad.exp")}
            </p>
            <p className="font-bold text-lg text-frost">
              <ExperienceTierLabel value={player.experience} />
            </p>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              {t("transfers.detail.currentPrice")}
            </p>
            <p className={`font-bold text-xl ${
              bidStatus === "leading" || bidStatus === "won"
                ? "text-accent"
                : "text-frost"
            }`}>
              {formatCurrency(transfer.currentPrice)}
            </p>
          </div>
        </div>
      </div>

      {/* Specialties — v2 with tier */}
      <div className="flex flex-wrap gap-2 mb-5">
        {player.coreSpecialty ? (
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border uppercase tracking-wider ${
              player.coreSpecialtyTier === 'GOLD'
                ? 'bg-amber-300/10 text-amber-300 border-amber-300/30'
                : player.coreSpecialtyTier === 'SILVER'
                ? 'bg-slate-300/10 text-slate-300 border-slate-300/30'
                : 'bg-stone-400/10 text-stone-400 border-stone-400/30'
            }`}
          >
            <SpecialtyIcon
              code={player.coreSpecialty}
              tier={player.coreSpecialtyTier}
              size="xs"
            />
            {getSpecialtyLabel(player.coreSpecialty, locale === "en" ? "en" : "zh")}
            {player.coreSpecialtyTier && (
              <span className="opacity-60 ml-0.5">· {player.coreSpecialtyTier}</span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 bg-stone-500/10 text-stone-500 text-[10px] px-3 py-1.5 rounded-lg border border-stone-500/20 uppercase tracking-wider">
            {t("transfers.specialty.none")}
          </span>
        )}
      </div>

      {/* Skills - Profile Style */}
      <div className="grid grid-cols-4 gap-6">
        {/* Technical */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-accent rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-muted">
              {t("transfers.detail.technical")}
            </h3>
          </div>
          <div className="space-y-2">
            {isGK ? (
              <>
                {renderSkillBar(
                  t("squad.skills.reflexes"),
                  skills?.technical?.reflexes || 0,
                  potential?.technical?.reflexes || 0,
                  "text-accent",
                )}
                {renderSkillBar(
                  t("squad.skills.handling"),
                  skills?.technical?.handling || 0,
                  potential?.technical?.handling || 0,
                  "text-accent",
                )}
                {renderSkillBar(
                  t("squad.skills.aerial"),
                  skills?.technical?.aerial || 0,
                  potential?.technical?.aerial || 0,
                  "text-accent",
                )}
              </>
            ) : (
              <>
                {renderSkillBar(
                  t("squad.skills.finishing"),
                  skills?.technical?.finishing || 0,
                  potential?.technical?.finishing || 0,
                  "text-accent",
                )}
                {renderSkillBar(
                  t("squad.skills.passing"),
                  skills?.technical?.passing || 0,
                  potential?.technical?.passing || 0,
                  "text-accent",
                )}
                {renderSkillBar(
                  t("squad.skills.dribbling"),
                  skills?.technical?.dribbling || 0,
                  potential?.technical?.dribbling || 0,
                  "text-accent",
                )}
                {renderSkillBar(
                  t("squad.skills.defending"),
                  skills?.technical?.defending || 0,
                  potential?.technical?.defending || 0,
                  "text-accent",
                )}
              </>
            )}
          </div>
        </div>

        {/* Physical */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-signal-blue rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-muted">
              {t("transfers.detail.physical")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.pace"),
              skills?.physical?.pace || 0,
              potential?.physical?.pace || 0,
              "text-signal-blue",
            )}
            {renderSkillBar(
              t("squad.skills.strength"),
              skills?.physical?.strength || 0,
              potential?.physical?.strength || 0,
              "text-signal-blue",
            )}
          </div>
        </div>

        {/* Mental */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-signal-lime rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-muted">
              {t("transfers.detail.mental")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.composure"),
              skills?.mental?.composure || 0,
              potential?.mental?.composure || 0,
              "text-signal-lime",
            )}
            {renderSkillBar(
              t("squad.skills.positioning"),
              skills?.mental?.positioning || 0,
              potential?.mental?.positioning || 0,
              "text-signal-lime",
            )}
          </div>
        </div>

        {/* Set Pieces */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-signal-amber rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-muted">
              {t("squad.skills.setPieces")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.freeKicks"),
              skills?.setPieces?.freeKicks || 0,
              potential?.setPieces?.freeKicks || 0,
              "text-signal-amber",
            )}
            {renderSkillBar(
              t("squad.skills.penalties"),
              skills?.setPieces?.penalties || 0,
              potential?.setPieces?.penalties || 0,
              "text-signal-amber",
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
