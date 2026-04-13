"use client";

import { type TransferTransaction } from "@/lib/api";

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
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-[#91b2a6]">
        <span>{label}</span>
        <span className={colorClass}>{current}</span>
      </div>
      <div className="h-1 w-full bg-[#00251c] rounded-full overflow-hidden">
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
  const player = transaction.player;
  const initials = player.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  const skills = player.currentSkills as PlayerSkills;
  const isGK = player.isGoalkeeper;

  return (
    <div className="bg-[#001711] rounded-2xl p-5 border border-[#2f4e44]/20">
      {/* Header */}
      <div className="flex items-center gap-5 mb-5">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#002c22] to-[#001711] flex items-center justify-center font-bold text-2xl text-[#a1ffc2] border border-[#2f4e44]/30">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-xl text-[#d3f5e8] truncate">
              {player.name}
            </h3>
            {status === "failed" ? (
              <span className="bg-red-500/20 text-red-400 text-[11px] font-bold px-2 py-1 rounded-md">
                Failed
              </span>
            ) : (
              <span className="bg-[#a1ffc2]/10 text-[#a1ffc2] text-[11px] font-bold px-2 py-1 rounded-md border border-[#a1ffc2]/20">
                {isSale ? "SOLD" : "SIGNED"}
              </span>
            )}
          </div>
          <p className="text-sm text-[#91b2a6]">
            {player.age}岁{player.ageDays ? `${player.ageDays}天` : ""}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Age
            </p>
            <p className="font-bold text-lg text-[#d3f5e8]">{player.age}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Stamina
            </p>
            <p className="font-bold text-lg text-[#abf853]">{player.stamina || 85}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Form
            </p>
            <p className="font-bold text-lg text-[#f59e0b]">{player.form || 7.0}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider mb-1">
              Exp
            </p>
            <p className="font-bold text-lg text-[#d3f5e8]">{player.experience || 0}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center w-36 h-14 flex flex-col justify-between">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider">
              {isSale ? "Sale Price" : "Purchase Price"}
            </p>
            <p
              className={`font-headline font-black text-2xl tracking-tight ${
                status === "success" ? "text-[#a1ffc2]" : "text-[#d3f5e8]"
              }`}
            >
              {formatCurrency(transaction.amount)}
            </p>
          </div>
          <div className="text-center w-36 h-14 flex flex-col justify-between">
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider">
              {isSale ? "To" : "From"}
            </p>
            <p className="font-bold text-lg text-[#d3f5e8]">
              {isSale
                ? transaction.toTeam?.name?.toUpperCase() || "UNKNOWN"
                : transaction.fromTeam?.name?.toUpperCase() || "UNKNOWN"}
            </p>
          </div>
        </div>
      </div>

      {/* Specialties */}
      {player.specialties && player.specialties.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {player.specialties.map((spec, idx) => (
            <span
              key={idx}
              className="bg-[#a1ffc2]/10 text-[#a1ffc2] text-[10px] px-3 py-1.5 rounded-lg border border-[#a1ffc2]/20 uppercase tracking-wider"
            >
              {spec}
            </span>
          ))}
        </div>
      )}

      {/* Skills - Compact Grid */}
      <div className="grid grid-cols-4 gap-4">
        {/* Technical */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-[#a1ffc2] rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-[#91b2a6]">
              Technical
            </h4>
          </div>
          <div className="space-y-1.5">
            {isGK ? (
              <>
                {renderSkillBar("REF", skills?.technical?.reflexes || 0, "text-[#a1ffc2]")}
                {renderSkillBar("HAN", skills?.technical?.handling || 0, "text-[#a1ffc2]")}
                {renderSkillBar("AER", skills?.technical?.aerial || 0, "text-[#a1ffc2]")}
              </>
            ) : (
              <>
                {renderSkillBar("FIN", skills?.technical?.finishing || 0, "text-[#a1ffc2]")}
                {renderSkillBar("PAS", skills?.technical?.passing || 0, "text-[#a1ffc2]")}
                {renderSkillBar("DRI", skills?.technical?.dribbling || 0, "text-[#a1ffc2]")}
                {renderSkillBar("DEF", skills?.technical?.defending || 0, "text-[#a1ffc2]")}
              </>
            )}
          </div>
        </div>

        {/* Physical */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-[#abf853] rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-[#91b2a6]">
              Physical
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("PAC", skills?.physical?.pace || 0, "text-[#abf853]")}
            {renderSkillBar("STR", skills?.physical?.strength || 0, "text-[#abf853]")}
          </div>
        </div>

        {/* Mental */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-[#f59e0b] rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-[#91b2a6]">
              Mental
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("COM", skills?.mental?.composure || 0, "text-[#f59e0b]")}
            {renderSkillBar("POS", skills?.mental?.positioning || 0, "text-[#f59e0b]")}
          </div>
        </div>

        {/* Set Pieces */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1 h-3 bg-[#ec4899] rounded-full" />
            <h4 className="text-[10px] font-black tracking-widest uppercase text-[#91b2a6]">
              Set Pieces
            </h4>
          </div>
          <div className="space-y-1.5">
            {renderSkillBar("FK", skills?.setPieces?.freeKicks || 0, "text-[#ec4899]")}
            {renderSkillBar("PEN", skills?.setPieces?.penalties || 0, "text-[#ec4899]")}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end mt-4 pt-4 border-t border-[#2f4e44]/20">
        <p className="text-[10px] text-[#91b2a6] font-bold uppercase tracking-widest">
          {isSale ? "SOLD" : "PURCHASED"} · {new Date(transaction.transactionDate).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
