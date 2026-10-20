"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { type TransferAuction } from "@/lib/api";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { barClassFor } from "@/components/player/skill-display";
import { getSpecialtyLabel } from "@/lib/specialties";
import { StatTile } from "@/components/player/profile/player-profile-primitives";
import { conditionTier, conditionToneClass } from "@/lib/condition-tone";
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
      <div className="flex justify-between text-kicker font-bold uppercase tracking-wider text-on-surface-variant">
        <span>{label}</span>
        <span className={colorClass}>
          {current}/{potential}
        </span>
      </div>
      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
        <div
          className={`h-full ${barClassFor(colorClass)} rounded-full`}
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
      className={`rounded-xl border p-tight transition-colors duration-quick ${
        onClick ? "cursor-pointer" : ""
      } ${
        isSelected
          ? "border-primary/30 bg-primary/10"
          : "border-transparent bg-surface-container-low hover:border-white/[0.06] hover:bg-white/[0.04]"
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-panel">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] font-headline text-xl font-black text-on-surface"
          style={{ background: "linear-gradient(135deg, #00e47926, #00e4790a)" }}
          aria-hidden="true"
        >
          {initials}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-tight">
          <div className="flex min-w-0 flex-wrap items-center gap-tight">
            <Link
              href={`/${locale}/players/${player.id}`}
              className={`truncate font-headline text-lg font-bold transition-colors duration-quick hover:text-primary ${
                isSelected ? "text-primary" : "text-on-surface"
              }`}
            >
              {player.name}
            </Link>
            <span className="rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-label text-kicker font-bold tabular-nums text-outline">
              #{player.id}
            </span>
          </div>

          {/* The club is a chip, not a run-on sentence: the old line read
              "30岁13天 · Club · £4,694/周" and wrapped mid-number at the
              container's narrowest width. */}
          <div className="flex flex-wrap items-center gap-tight">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleTeamClick(transfer.team.id);
              }}
              className="inline-flex items-center gap-micro rounded-full border border-white/[0.08] bg-white/[0.04] px-tight py-micro font-label text-kicker transition-colors duration-quick hover:border-primary/40"
            >
              <span className="uppercase tracking-[0.08em] text-outline">
                {t("player_profile.club")}
              </span>
              <span className="font-bold text-on-surface">
                {player.teamName || transfer.team.name}
              </span>
            </button>
            {player.position ? (
              <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-tight py-micro font-label text-kicker font-bold text-on-surface-variant">
                {player.position}
              </span>
            ) : null}
            {player.coreSpecialty ? (
              <span
                className={`inline-flex items-center gap-micro font-label text-kicker font-bold ${
                  player.coreSpecialtyTier === "GOLD"
                    ? "text-tertiary"
                    : player.coreSpecialtyTier === "SILVER"
                      ? "text-on-surface-variant"
                      : "text-outline"
                }`}
              >
                <SpecialtyIcon
                  code={player.coreSpecialty}
                  tier={player.coreSpecialtyTier}
                  size="sm"
                />
                {getSpecialtyLabel(player.coreSpecialty, locale === "en" ? "en" : "zh")}
              </span>
            ) : null}
          </div>

        </div>

        {/* Price block: label, number, unit, countdown — stacked on the
            same right edge so they read as one object. The wage used to
            sit under the price with no label, which made it look like a
            second price. */}
        <div className="flex shrink-0 flex-col items-end gap-micro text-right">
          <span className="font-label text-kicker uppercase tracking-widest text-outline">
            {t("transfers.detail.currentPrice")}
          </span>
          <span
            className={`font-headline text-2xl font-bold leading-none tabular-nums ${
              bidStatus === "leading" || bidStatus === "won"
                ? "text-primary"
                : "text-on-surface"
            }`}
          >
            {formatCurrency(transfer.currentPrice)}
          </span>
          <span className="font-label text-kicker text-on-surface-variant">
            {t("squad.wage")} {t("common.currencySymbol")}
            {(player.currentWage || 0).toLocaleString()}
          </span>
          <span
            className={`mt-micro rounded-md px-tight py-0.5 font-label text-kicker font-bold uppercase tracking-wider ${
              isExpired
                ? "bg-danger/15 text-danger"
                : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            {timeLeft}
          </span>
        </div>
      </div>

      {/* Stat strip — same tile recipe as the profile's three-up condition
          strip, so a candidate reads like the player he becomes. Four tiles
          here because this card has no separate meta row for age. */}
      <div className="mt-gutter grid grid-cols-2 gap-tight sm:grid-cols-4">
        <StatTile
          label={t("squad.age")}
          value={t("common.ageFormat", { y: player.age, d: player.ageDays })}
          tone="text-on-surface"
        />
        <StatTile
          label={t("squad.stamina")}
          value={t(`squad.staminaTier.${conditionTier(player.stamina ?? 0)}`)}
          tone={conditionToneClass(player.stamina ?? 0, 4, 2)}
          tooltip={`${Math.min(5, Math.max(0, Math.round(player.stamina ?? 0)))}/5`}
        />
        <StatTile
          label={t("squad.form")}
          value={t(`squad.formTier.${conditionTier(player.form ?? 0)}`)}
          tone={conditionToneClass(player.form ?? 0, 4, 2)}
          tooltip={`${Math.min(5, Math.max(0, Math.round(player.form ?? 0)))}/5`}
        />
        <StatTile
          label={t("squad.exp")}
          value={
            <ExperienceTierLabel
              value={player.experience}
              className="text-xl font-black leading-none"
              showTitle={false}
            />
          }
          tone="text-on-surface"
          tooltip={`${Math.round(player.experience ?? 0)} XP`}
        />
      </div>

      {/* Skills - Profile Style */}
      <div className="grid grid-cols-4 gap-6">
        {/* Technical */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-accent rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-on-surface-variant">
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
            <h3 className="text-xs font-black tracking-widest uppercase text-on-surface-variant">
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
            <div className="w-1.5 h-4 bg-signal-lilac rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-on-surface-variant">
              {t("transfers.detail.mental")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.composure"),
              skills?.mental?.composure || 0,
              potential?.mental?.composure || 0,
              "text-signal-lilac",
            )}
            {renderSkillBar(
              t("squad.skills.positioning"),
              skills?.mental?.positioning || 0,
              potential?.mental?.positioning || 0,
              "text-signal-lilac",
            )}
          </div>
        </div>

        {/* Set Pieces */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-4 bg-signal-gold rounded-full" />
            <h3 className="text-xs font-black tracking-widest uppercase text-on-surface-variant">
              {t("squad.skills.setPieces")}
            </h3>
          </div>
          <div className="space-y-2">
            {renderSkillBar(
              t("squad.skills.freeKicks"),
              skills?.setPieces?.freeKicks || 0,
              potential?.setPieces?.freeKicks || 0,
              "text-signal-gold",
            )}
            {renderSkillBar(
              t("squad.skills.penalties"),
              skills?.setPieces?.penalties || 0,
              potential?.setPieces?.penalties || 0,
              "text-signal-gold",
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
