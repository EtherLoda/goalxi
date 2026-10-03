"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { type TransferTransaction } from "@/lib/api";
import { SpecialtyIcon } from "@/components/player/SpecialtyIcon";
import { getSpecialtyLabel } from "@/lib/specialties";
import { ExperienceTierLabel } from "@/components/ExperienceTierLabel";

interface PlayerSkills {
  physical: { pace?: number; strength?: number };
  technical: Record<string, number>;
  mental: { composure?: number; positioning?: number };
  setPieces: { freeKicks?: number; penalties?: number };
}

interface TransferTransactionCardProps {
  transaction: TransferTransaction;
  formatCurrency: (value: number) => string;
  isSale?: boolean;
  status?: "success" | "failed";
}

const SKILL_MAX = 20;

function renderSkillBar(
  label: string,
  current: number,
  colorClass: string,
) {
  const percentage = (current / SKILL_MAX) * 100;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className={colorClass}>{current}</span>
      </div>
      <div className="h-1 w-full bg-ink-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClass.replace("text-", "bg-")} rounded-full`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function TransferTransactionCard({
  transaction,
  formatCurrency,
  isSale = false,
  status = "success",
}: TransferTransactionCardProps) {
  const locale = useLocale();
  const t = useTranslations();
  const player = transaction.player;
  const initials = player.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const skills = player.currentSkills as unknown as PlayerSkills;
  const isGK = player.isGoalkeeper;

  return (
    <div className="bg-ink-900 rounded-2xl p-5 border border-edge/20">
      {/* Header */}
      <div className="flex items-center gap-5 mb-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ink-600 to-ink-900 flex items-center justify-center font-bold text-2xl text-accent border border-edge/30">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <Link href={`/players/${player.id}`} className="font-bold text-xl text-frost truncate hover:text-accent transition-colors">
              {player.name}
            </Link>
            {status === "failed" ? (
              <span className="bg-danger/20 text-red-400 text-[11px] font-bold px-2 py-1 rounded-lg">
                Failed
              </span>
            ) : (
              <span className="bg-accent/10 text-accent text-[11px] font-bold px-2 py-1 rounded-lg border border-accent/20">
                {isSale ? "SOLD" : "SIGNED"}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {t("common.ageFormat", { y: player.age, d: player.ageDays })}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              Age
            </p>
            <p className="font-bold text-lg text-frost">{player.age}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              Stamina
            </p>
            <p className="font-bold text-lg text-signal-lime">{player.stamina || 85}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              Form
            </p>
            <p className="font-bold text-lg text-signal-amber">{player.form || 7.0}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-1">
              Exp
            </p>
            <ExperienceTierLabel value={player.experience} className="font-bold text-lg text-frost" />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center w-36 h-14 flex flex-col justify-between">
            <p className="text-[10px] text-muted uppercase tracking-wider">
              {isSale ? "Sale Price" : "Purchase Price"}
            </p>
            <p
              className={`font-headline font-black text-2xl tracking-tight ${
                status === "success" ? "text-accent" : "text-frost"
              }`}
            >
              {formatCurrency(transaction.amount)}
            </p>
          </div>
          <div className="text-center w-36 h-14 flex flex-col justify-between">
            <p className="text-[10px] text-muted uppercase tracking-wider">
              {isSale ? "To" : "From"}
            </p>
            <p className="font-bold text-lg text-frost">
              {isSale
                ? transaction.toTeam?.name?.toUpperCase() || "UNKNOWN"
                : transaction.fromTeam?.name?.toUpperCase() || "UNKNOWN"}
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
            — 无特技
          </span>
        )}
      </div>

      {/* Skills - Compact Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Technical */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-accent rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-muted">
              Technical
            </h4>
          </div>
          <div className="space-y-1.5">
            {isGK ? (
              <>
                {renderSkillBar("REF", skills?.technical?.reflexes || 0, "text-accent")}
                {renderSkillBar("HAN", skills?.technical?.handling || 0, "text-accent")}
                {renderSkillBar("AER", skills?.technical?.aerial || 0, "text-accent")}
              </>
            ) : (
              <>
                {renderSkillBar("FIN", skills?.technical?.finishing || 0, "text-accent")}
                {renderSkillBar("PAS", skills?.technical?.passing || 0, "text-accent")}
                {renderSkillBar("DRI", skills?.technical?.dribbling || 0, "text-accent")}
                {renderSkillBar("DEF", skills?.technical?.defending || 0, "text-accent")}
              </>
            )}
          </div>
        </div>

        {/* Physical */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-signal-lime rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-muted">
              Physical
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("PAC", skills?.physical?.pace || 0, "text-signal-lime")}
            {renderSkillBar("STR", skills?.physical?.strength || 0, "text-signal-lime")}
          </div>
        </div>

        {/* Mental */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-signal-amber rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-muted">
              Mental
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("COM", skills?.mental?.composure || 0, "text-signal-amber")}
            {renderSkillBar("POS", skills?.mental?.positioning || 0, "text-signal-amber")}
          </div>
        </div>

        {/* Set Pieces */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-signal-pink rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-muted">
              Set Pieces
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("FK", skills?.setPieces?.freeKicks || 0, "text-signal-pink")}
            {renderSkillBar("PEN", skills?.setPieces?.penalties || 0, "text-signal-pink")}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end mt-4 pt-4 border-t border-edge/20">
        <p className="text-[10px] text-muted font-bold uppercase tracking-widest">
          {isSale ? "SOLD" : "PURCHASED"} · {new Date(transaction.transactionDate).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
