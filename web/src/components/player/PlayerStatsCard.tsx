"use client";

import { useTranslations } from "next-intl";

const SKILL_MAX = 20;

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
      <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider text-[#91b2a6]">
        <span>{label}</span>
        <span className={colorClass}>
          {Math.floor(current)}/{Math.floor(potential)}
        </span>
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

const CATEGORY_COLORS: Record<string, string> = {
  physical: "text-[#a1ffc2]",
  technical: "text-[#60a5fa]",
  mental: "text-[#c084fc]",
  setPieces: "text-[#fbbf24]",
};

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
      ? "text-[#a1ffc2]"
      : player.stamina >= 2
        ? "text-[#abf853]"
        : "text-red-400";

  const formOrCondition = player.form ?? player.condition ?? 0;
  const formColor =
    formOrCondition >= 4
      ? "text-[#a1ffc2]"
      : formOrCondition >= 2
        ? "text-[#abf853]"
        : "text-red-400";

  const SKILL_LABELS: Record<string, { en: string; zh: string }> = {
    pace: { en: "Pace", zh: "速度" },
    strength: { en: "Strength", zh: "力量" },
    tackling: { en: "Tackle", zh: "抢断" },
    shooting: { en: "Shoot", zh: "射门" },
    passing: { en: "Pass", zh: "传球" },
    dribbling: { en: "Dribble", zh: "盘带" },
    crossing: { en: "Cross", zh: "传中" },
    finishing: { en: "Finish", zh: "终结" },
    heading: { en: "Header", zh: "头球" },
    positioning: { en: "Posit", zh: "位置" },
    composure: { en: "Comps", zh: "镇定" },
    vision: { en: "Vision", zh: "视野" },
    freeKicks: { en: "FKick", zh: "任意球" },
    penalties: { en: "Penalt", zh: "点球" },
    agility: { en: "Agility", zh: "敏捷" },
    reflexes: { en: "Reflex", zh: "反应" },
    handling: { en: "Handle", zh: "扑救" },
  };

  const getSkillLabel = (skill: string) => {
    const lower = skill.toLowerCase();
    if (SKILL_LABELS[lower]) {
      return locale === "zh" ? SKILL_LABELS[lower].zh : SKILL_LABELS[lower].en;
    }
    return skill.charAt(0).toUpperCase() + skill.slice(1);
  };

  const formatSkillLabel = (skill: string) => getSkillLabel(skill);

  const categoryNames = {
    physical: locale === "zh" ? "体能" : "Physical",
    technical: locale === "zh" ? "技术" : "Technical",
    mental: locale === "zh" ? "心智" : "Mental",
    setPieces: locale === "zh" ? "定位球" : "Set Pieces",
  };

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
      <div onClick={onClick} className="bg-[#001e17] rounded-xl p-3 border border-[#2f4e44]/20 cursor-pointer hover:bg-[#00251c] transition-colors">
        {/* Header with name and basic stats */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-[#00251c] flex items-center justify-center text-[10px] font-bold text-[#a1ffc2]">
            {player.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-[#d3f5e8] truncate">{player.name}</div>
            <div className="text-[9px] text-[#91b2a6]">{player.age}y</div>
          </div>
        </div>

        {/* Top Stats */}
        <div className="grid grid-cols-4 gap-1 mb-3">
          <div className="flex flex-col items-center">
            <span className="text-sm font-black text-[#a1ffc2]">{player.pwi}</span>
            <span className="text-[7px] text-[#91b2a6]">PWI</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-sm font-black ${staminaColor}`}>{Math.floor(player.stamina)}</span>
            <span className="text-[7px] text-[#91b2a6]">STA</span>
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-sm font-black ${formColor}`}>{Math.floor(formOrCondition)}</span>
            <span className="text-[7px] text-[#91b2a6]">{locale === "zh" ? "状态" : "FRM"}</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-sm font-black text-[#d3f5e8]">{player.experience}</span>
            <span className="text-[7px] text-[#91b2a6]">EXP</span>
          </div>
        </div>

        {/* Skills Grid - 2 columns - only show if compactShowSkills is true */}
        {compactShowSkills && (
          <div className="grid grid-cols-2 gap-3">
            {(["physical", "technical", "mental", "setPieces"] as const).map((cat) => {
              const catSkills = skillsByCategory[cat];
              if (!catSkills || catSkills.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[8px] text-[#4a7a6a] uppercase mb-1">{categoryNames[cat]}</div>
                  <div className="space-y-1">
                    {catSkills.slice(0, 2).map((sk) => (
                      <SkillBar
                        key={sk.skill}
                        label={formatSkillLabel(sk.skill)}
                        current={sk.current}
                        potential={sk.potential}
                        colorClass={CATEGORY_COLORS[cat] || "text-[#a1ffc2]"}
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
    <div className="bg-[#001e17] rounded-xl p-4 border border-[#2f4e44]/20">
      {/* Gauges */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-[#00251c] rounded-xl p-2 flex flex-col items-center justify-center border border-[#2f4e44]/10">
          <div className="text-lg font-black text-[#a1ffc2]">{player.pwi}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#91b2a6]">PWI</span>
        </div>
        <div className="bg-[#00251c] rounded-xl p-2 flex flex-col items-center justify-center border border-[#2f4e44]/10">
          <div className={`text-lg font-black ${staminaColor}`}>{Math.floor(player.stamina)}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#91b2a6]">
            {locale === "zh" ? "体能" : "STA"}
          </span>
        </div>
        <div className="bg-[#00251c] rounded-xl p-2 flex flex-col items-center justify-center border border-[#2f4e44]/10">
          <div className={`text-lg font-black ${formColor}`}>{Math.floor(formOrCondition)}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#91b2a6]">
            {locale === "zh" ? "状态" : "FRM"}
          </span>
        </div>
        <div className="bg-[#00251c] rounded-xl p-2 flex flex-col items-center justify-center border border-[#2f4e44]/10">
          <div className="text-lg font-black text-[#d3f5e8]">{player.experience}</div>
          <span className="text-[8px] font-bold uppercase tracking-widest text-[#91b2a6]">EXP</span>
        </div>
      </div>

      {/* Skills */}
      <div className="grid grid-cols-2 gap-4">
        {(["physical", "technical", "mental", "setPieces"] as const).map((cat) => {
          const catSkills = skillsByCategory[cat];
          if (!catSkills || catSkills.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={`w-1 h-3 rounded-full ${CATEGORY_COLORS[cat]?.replace("text-", "bg-") || "bg-[#a1ffc2]"}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                  {categoryNames[cat]}
                </span>
              </div>
              <div className="space-y-2">
                {catSkills.map((sk) => (
                  <SkillBar
                    key={sk.skill}
                    label={formatSkillLabel(sk.skill)}
                    current={sk.current}
                    potential={sk.potential}
                    colorClass={CATEGORY_COLORS[cat] || "text-[#a1ffc2]"}
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
