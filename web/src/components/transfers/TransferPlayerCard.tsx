"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { type TransferAuction, type Player } from "@/lib/api";

interface TransferPlayerCardProps {
  transfer: TransferAuction;
  isSelected?: boolean;
  onClick?: () => void;
  formatCurrency: (value: number) => string;
  formatTimeRemaining: (expiresAt: string) => string;
  bidStatus?: "leading" | "outbid" | "won" | "lost";
}

const SKILL_MAX = 20;

function renderSkillBar(
  label: string,
  current: number,
  potential: number,
  colorClass: string,
) {
  const percentage = (current / SKILL_MAX) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-[#91b2a6]">
        <span>{label}</span>
        <span className={colorClass}>
          {current}/{potential}
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
  const player = transfer.player;
  const initials = player.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  const timeLeft = formatTimeRemaining(transfer.expiresAt);
  const isExpired = timeLeft === "Expired";
  const skills = player.currentSkills as any;
  const isGK = player.isGoalkeeper;

  return (
    <div
      onClick={onClick}
      className={`bg-[#001711] rounded-2xl p-5 transition-all border ${
        onClick
          ? "cursor-pointer hover:border-[#2f4e44]/40 hover:bg-[#001e17]"
          : ""
      } ${
        isSelected
          ? "border-[#a1ffc2] ring-1 ring-[#a1ffc2]/30"
          : "border-[#2f4e44]/20"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-6 mb-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#002c22] to-[#001711] flex items-center justify-center font-bold text-2xl text-[#a1ffc2] border border-[#2f4e44]/30">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <Link href={`/players/${player.id}`} className={`font-bold text-xl truncate hover:text-[#a1ffc2] transition-colors ${isSelected ? "text-[#a1ffc2]" : "text-[#d3f5e8]"}`}>
              {player.name}
            </Link>
            <span
              className={`text-[11px] font-bold px-2 py-1 rounded-md ${
                isExpired
                  ? "bg-red-500/20 text-red-400"
                  : "bg-[#002c22] text-[#91b2a6]"
              }`}
            >
              {timeLeft}
            </span>
          </div>
          <p className="text-sm text-[#91b2a6]">
            {player.age}岁{player.ageDays || 0}天 ·{" "}
            {player.teamName || transfer.team.name} · £
            {(player.currentWage || 0).toLocaleString()}/w
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              {t("squad.age")}
            </p>
            <p className="font-bold text-lg text-[#d3f5e8]">{player.age}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              {t("squad.stamina")}
            </p>
            <p className="font-bold text-lg text-[#abf853]">
              {player.stamina || 85}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              {t("squad.form")}
            </p>
            <p className="font-bold text-lg text-[#f59e0b]">
              {player.form || 7.0}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              {t("squad.exp")}
            </p>
            <p className="font-bold text-lg text-[#d3f5e8]">
              {player.experience || 0}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Current Price
            </p>
            <p className={`font-bold text-xl ${
              bidStatus === "leading" || bidStatus === "won"
                ? "text-[#a1ffc2]"
                : "text-[#d3f5e8]"
            }`}>
              {formatCurrency(transfer.currentPrice)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Buyout
            </p>
            <p className="font-bold text-xl text-[#91b2a6]">
              {formatCurrency(transfer.buyoutPrice)}
            </p>
          </div>
        </div>
      </div>

      {/* Specialties */}
      {player.specialty && (
        <div className="flex flex-wrap gap-2 mb-5">
          <span
            className="bg-[#a1ffc2]/10 text-[#a1ffc2] text-[10px] px-3 py-1.5 rounded-lg border border-[#a1ffc2]/20 uppercase tracking-wider"
          >
            {player.specialty}
          </span>
        </div>
      )}

      {/* Skills - Profile Style */}
      <div className="grid grid-cols-4 gap-6">
        {/* Technical */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">
              {t("transfers.detail.technical")}
            </h3>
          </div>
          <div className="space-y-2">
            {isGK ? (
              <>
                {renderSkillBar(
                  t("squad.skills.reflexes"),
                  skills?.technical?.reflexes || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
                {renderSkillBar(
                  t("squad.skills.handling"),
                  skills?.technical?.handling || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
                {renderSkillBar(
                  t("squad.skills.aerial"),
                  skills?.technical?.aerial || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
              </>
            ) : (
              <>
                {renderSkillBar(
                  t("squad.skills.finishing"),
                  skills?.technical?.finishing || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
                {renderSkillBar(
                  t("squad.skills.passing"),
                  skills?.technical?.passing || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
                {renderSkillBar(
                  t("squad.skills.dribbling"),
                  skills?.technical?.dribbling || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
                {renderSkillBar(
                  t("squad.skills.defending"),
                  skills?.technical?.defending || 0,
                  20,
                  "text-[#a1ffc2]",
                )}
              </>
            )}
          </div>
        </div>

        {/* Physical */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-[#abf853] rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">
              {t("transfers.detail.physical")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.pace"),
              skills?.physical?.pace || 0,
              20,
              "text-[#abf853]",
            )}
            {renderSkillBar(
              t("squad.skills.strength"),
              skills?.physical?.strength || 0,
              20,
              "text-[#abf853]",
            )}
          </div>
        </div>

        {/* Mental */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-[#f59e0b] rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">
              {t("transfers.detail.mental")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.composure"),
              skills?.mental?.composure || 0,
              20,
              "text-[#f59e0b]",
            )}
            {renderSkillBar(
              t("squad.skills.positioning"),
              skills?.mental?.positioning || 0,
              20,
              "text-[#f59e0b]",
            )}
          </div>
        </div>

        {/* Set Pieces */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-[#ec4899] rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-[#91b2a6]">
              {t("squad.skills.setPieces")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.freeKicks"),
              skills?.setPieces?.freeKicks || 0,
              20,
              "text-[#ec4899]",
            )}
            {renderSkillBar(
              t("squad.skills.penalties"),
              skills?.setPieces?.penalties || 0,
              20,
              "text-[#ec4899]",
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
