"use client";

import { useTranslations } from "next-intl";
import { CATEGORY_COLORS, SKILL_CATEGORIES, SKILL_MAX, formatSkillLabel, getCategoryName } from "./skill-display";
import { ExperienceTierLabel } from "../ExperienceTierLabel";

interface SkillBarProps {
  label: string;
  current: number;
  potential: number;
  colorClass: string;
}

export function SkillBar({ label, current, potential, colorClass }: SkillBarProps) {
  const percentage = (current / SKILL_MAX) * 100;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className={colorClass}>
          {Math.floor(current)}/{Math.floor(potential)}
        </span>
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

interface SkillData {
  skill: string;
  current: number;
  potential: number;
  category: string | null;
}

interface PlayerStatsCardProps {
  player: {
    name: string;
    age: number;
    ageDays?: number;
    stamina: number;
    form?: number;
    condition?: number;
    experience: number;
    pwi: number;
    currentSkills?: {
      physical?: Record<string, number>;
      technical?: Record<string, number>;
      mental?: Record<string, number>;
      setPieces?: Record<string, number>;
    };
    potentialSkills?: {
      physical?: Record<string, number>;
      technical?: Record<string, number>;
      mental?: Record<string, number>;
      setPieces?: Record<string, number>;
    };
    isGoalkeeper?: boolean;
  };
  skillBreakdown?: SkillData[];
  compact?: boolean;
  compactShowSkills?: boolean;
  locale?: string;
  onClick?: () => void;
}

export default function PlayerStatsCard({
  player,
  skillBreakdown,
  compact = false,
  compactShowSkills = true,
  locale = "en",
  onClick,
}: PlayerStatsCardProps) {
  const t = useTranslations("squad");

  const staminaColor =
    player.stamina >= 4
      ? "text-accent"
      : player.stamina >= 2
        ? "text-signal-lime"
        : "text-red-400";

  const formOrCondition = player.form ?? player.condition ?? 0;
  const formColor =
    formOrCondition >= 4
      ? "text-accent"
      : formOrCondition >= 2
        ? "text-signal-lime"
        : "text-red-400";

  // Build skills data from skillBreakdown or currentSkills
  let skillsData: SkillData[] = [];
  if (skillBreakdown && skillBreakdown.length > 0) {
    skillsData = skillBreakdown;
  } else {
    const { currentSkills, potentialSkills } = player;
    if (currentSkills?.physical) {
      for (const [skill, value] of Object.entries(currentSkills.physical)) {
        const pot = potentialSkills?.physical?.[skill] || value || 0;
        skillsData.push({ skill, current: value || 0, potential: pot, category: "physical" });
      }
    }
    if (currentSkills?.technical) {
      for (const [skill, value] of Object.entries(currentSkills.technical)) {
        const pot = potentialSkills?.technical?.[skill] || value || 0;
        skillsData.push({ skill, current: value || 0, potential: pot, category: "technical" });
      }
    }
    if (currentSkills?.mental) {
      for (const [skill, value] of Object.entries(currentSkills.mental)) {
        const pot = potentialSkills?.mental?.[skill] || value || 0;
        skillsData.push({ skill, current: value || 0, potential: pot, category: "mental" });
      }
    }
    if (currentSkills?.setPieces) {
      for (const [skill, value] of Object.entries(currentSkills.setPieces)) {
        const pot = potentialSkills?.setPieces?.[skill] || value || 0;
        skillsData.push({ skill, current: value || 0, potential: pot, category: "setPieces" });
      }
    }
  }

  // Group skills by category
  const skillsByCategory: Record<string, SkillData[]> = {};
  for (const sk of skillsData) {
    const cat = sk.category || "other";
    if (!skillsByCategory[cat]) skillsByCategory[cat] = [];
    skillsByCategory[cat].push(sk);
  }

  if (compact) {
    return (
      <div onClick={onClick} className="bg-ink-800 rounded-xl p-3 border border-edge/20 cursor-pointer hover:bg-ink-700 transition-colors">
        {/* Header with name and basic stats */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-ink-700 flex items-center justify-center text-[10px] font-bold text-accent">
            {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-frost truncate">{player.name}</div>
            <div className="text-[9px] text-muted">{player.age}y</div>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-4 gap-1 mb-3">
          <div className="flex flex-col items-center">
            <span className="text-sm font-black text-accent">{player.pwi}</span>
            <span className="text-[7px] text-muted">PWI</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-sm font-black ${staminaColor}`}>{Math.floor(player.stamina)}</span>
            <span className="text-[7px] text-muted">STA</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-sm font-black ${formColor}`}>{Math.floor(formOrCondition)}</span>
            <span className="text-[7px] text-muted">{locale === "zh" ? "状态" : "FRM"}</span>
          </div>
          <div className="flex flex-col items-center">
            <ExperienceTierLabel value={player.experience} className="text-sm font-black text-frost" />
            <span className="text-[7px] text-muted">EXP</span>
          </div>
        </div>

        {/* Skills Grid - 2 columns - only show if compactShowSkills is true */}
        {compactShowSkills && (
          <div className="grid grid-cols-2 gap-3">
            {SKILL_CATEGORIES.map((cat) => {
              const catSkills = skillsByCategory[cat];
              if (!catSkills || catSkills.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[8px] text-faint uppercase mb-1">{getCategoryName(cat, locale as 'en' | 'zh')}</div>
                  <div className="space-y-1">
                    {catSkills.slice(0, 2).map((sk) => (
                      <SkillBar
                        key={sk.skill}
                        label={formatSkillLabel(sk.skill, locale as 'en' | 'zh')}
                        current={sk.current}
                        potential={sk.potential}
                        colorClass={CATEGORY_COLORS[cat] || "text-accent"}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Full version
  return (
    <div className="bg-ink-800 rounded-xl p-4 border border-edge/20">
      {/* Gauges */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-ink-700 rounded-xl p-2 flex flex-col items-center justify-center border border-edge/10">
          <div className="text-lg font-black text-accent">{player.pwi}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted">PWI</span>
        </div>
        <div className="bg-ink-700 rounded-xl p-2 flex flex-col items-center justify-center border border-edge/10">
          <div className={`text-lg font-black ${staminaColor}`}>{Math.floor(player.stamina)}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted">
            {locale === "zh" ? "体能" : "STA"}
          </span>
        </div>
        <div className="bg-ink-700 rounded-xl p-2 flex flex-col items-center justify-center border border-edge/10">
          <div className={`text-lg font-black ${formColor}`}>{Math.floor(formOrCondition)}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted">
            {locale === "zh" ? "状态" : "FRM"}
          </span>
        </div>
        <div className="bg-ink-700 rounded-xl p-2 flex flex-col items-center justify-center border border-edge/10">
          <ExperienceTierLabel value={player.experience} className="text-lg font-black text-frost" />
          <span className="text-[8px] font-bold uppercase tracking-widest text-muted">EXP</span>
        </div>
      </div>

      {/* Skills */}
      <div className="grid grid-cols-2 gap-4">
        {SKILL_CATEGORIES.map((cat) => {
          const catSkills = skillsByCategory[cat];
          if (!catSkills || catSkills.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`w-1 h-3 rounded-full ${CATEGORY_COLORS[cat]?.replace("text-", "bg-") || "bg-accent"}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                  {getCategoryName(cat, locale as 'en' | 'zh')}
                </span>
              </div>
              <div className="space-y-2">
                {catSkills.map((sk) => (
                  <SkillBar
                    key={sk.skill}
                    label={formatSkillLabel(sk.skill, locale as 'en' | 'zh')}
                    current={sk.current}
                    potential={sk.potential}
                    colorClass={CATEGORY_COLORS[cat] || "text-accent"}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
