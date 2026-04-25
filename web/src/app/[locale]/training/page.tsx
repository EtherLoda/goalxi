"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type TrainingPlayer, type Staff } from "@/lib/api";

const TRAINING_CATEGORIES: Record<string, { label: string; labelEn: string }> = {
  PHYSICAL: { label: "身体训练", labelEn: "Physical" },
  TECHNICAL: { label: "技术训练", labelEn: "Technical" },
  MENTAL: { label: "心理训练", labelEn: "Mental" },
  SET_PIECES: { label: "定位球", labelEn: "Set Pieces" },
  GOALKEEPER: { label: "门将", labelEn: "Goalkeeper" },
};

const STAFF_ROLE_LABELS: Record<string, { label: string; labelEn: string }> = {
  HEAD_COACH: { label: "主教练", labelEn: "Head Coach" },
  FITNESS_COACH: { label: "体能教练", labelEn: "Fitness Coach" },
  PSYCHOLOGY_COACH: { label: "心理教练", labelEn: "Psychology Coach" },
  TECHNICAL_COACH: { label: "技术教练", labelEn: "Technical Coach" },
  SET_PIECE_COACH: { label: "定位球教练", labelEn: "Set Piece Coach" },
  GOALKEEPER_COACH: { label: "门将教练", labelEn: "Goalkeeper Coach" },
  TEAM_DOCTOR: { label: "队医", labelEn: "Team Doctor" },
};

const getInitials = (name: string) => {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

export default function TrainingPage() {
  const t = useTranslations();
  const { team } = useAuth();
  const [trainingData, setTrainingData] = useState<TrainingPlayer[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!team?.id) return;

    Promise.all([api.training.getWeeklyPoints(), api.staff.getAll()])
      .then(([training, staff]) => {
        setTrainingData(training);
        setStaffList(staff);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team?.id]);

  const getStaffByRole = (role: string) => {
    return staffList.find((s) => s.role === role);
  };

  const getPlayersByCategory = (category: string) => {
    return trainingData.filter((p) => p.trainingSlot === category);
  };

  const renderStars = (level: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      if (i <= level) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            star
          </span>
        );
      } else if (i === Math.ceil(level) && !Number.isInteger(level)) {
        stars.push(
          <span key={i} className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>
            star_half
          </span>
        );
      } else {
        stars.push(
          <span key={i} className="material-symbols-outlined text-xl text-on-surface-variant/30">
            star
          </span>
        );
      }
    }
    return stars;
  };

  const getFitnessLevel = (stamina: number) => {
    if (stamina >= 80) return { label: "High", color: "text-primary", bg: "bg-primary" };
    if (stamina >= 50) return { label: "Med", color: "text-tertiary", bg: "bg-tertiary" };
    return { label: "Low", color: "text-error", bg: "bg-error" };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-headline font-bold text-on-surface tracking-tight mb-1">
            Training Ground
          </h1>
          <p className="text-sm text-on-surface-variant font-body">
            Manage sessions, assign routines, and track development.
          </p>
        </div>
        <div className="hidden md:flex gap-3">
          <button className="px-4 py-2 border border-outline-variant/30 text-on-surface rounded-DEFAULT text-sm font-medium hover:bg-surface-container transition-colors">
            Schedules
          </button>
          <button className="px-4 py-2 bg-gradient-to-r from-primary to-on-primary-container text-on-primary rounded-DEFAULT text-sm font-bold shadow-[0_4px_12px_rgba(0,228,121,0.2)]">
            Assign Groups
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Training Groups by Category */}
        <div className="lg:col-span-8 space-y-6">
          {Object.entries(TRAINING_CATEGORIES).map(([category, { labelEn }]) => {
            const players = getPlayersByCategory(category);
            const coachRole = category === "GOALKEEPER" ? "GOALKEEPER_COACH" : category === "PHYSICAL" ? "FITNESS_COACH" : "TECHNICAL_COACH";
            const coach = getStaffByRole(coachRole);

            return (
              <div
                key={category}
                className="bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-DEFAULT p-6 shadow-[0_12px_32px_rgba(0,0,0,0.4)] border border-outline-variant/15"
              >
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    {coach ? (
                      <>
                        <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-lg font-bold text-on-surface border-2 border-surface-container">
                          {getInitials(coach.name)}
                        </div>
                        <div>
                          <h3 className="text-xl font-headline font-bold text-on-surface">{coach.name}</h3>
                          <div className="flex items-center gap-2 text-sm text-on-surface-variant mt-1">
                            <span className="px-2 py-0.5 bg-surface-container-low rounded text-xs">{labelEn}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <h3 className="text-xl font-headline font-bold text-on-surface">{labelEn}</h3>
                        <p className="text-sm text-on-surface-variant">No coach assigned</p>
                      </div>
                    )}
                  </div>
                  {coach && (
                    <div className="text-right flex flex-col items-end">
                      <div className="flex items-center gap-0.5 text-[#ffb700] drop-shadow-[0_0_8px_rgba(255,183,0,0.6)] mb-1">
                        {renderStars(coach.level)}
                      </div>
                      <span className="text-xs text-on-surface-variant uppercase tracking-wider font-medium">Rating</span>
                    </div>
                  )}
                </div>

                {/* Player Slots */}
                <div className="grid grid-cols-3 gap-4">
                  {players.slice(0, 3).map((player) => (
                    <div
                      key={player.playerId}
                      className="bg-surface-container-low rounded-DEFAULT border border-dashed border-outline-variant/50 p-4 flex flex-col items-center justify-center min-h-[120px] hover:border-primary/50 transition-colors cursor-pointer group"
                    >
                      <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mb-3 text-sm font-bold text-on-surface">
                        {getInitials(player.playerName)}
                      </div>
                      <span className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">
                        {player.playerName}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {player.weeklyPoints > 0 ? `+${player.weeklyPoints} pts` : "Rest"}
                      </span>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - players.length) }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="bg-surface-container-lowest rounded-DEFAULT border border-dashed border-outline-variant/30 p-4 flex flex-col items-center justify-center min-h-[120px] hover:border-primary/30 transition-colors cursor-pointer"
                    >
                      <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center mb-3">
                        <span className="material-symbols-outlined text-on-surface-variant">add</span>
                      </div>
                      <span className="text-xs text-on-surface-variant uppercase tracking-widest font-medium">
                        Assign
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Column: Squad Fitness */}
        <div className="lg:col-span-4 flex flex-col bg-surface-container-low rounded-DEFAULT border border-outline-variant/15 p-5 shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
          <h3 className="text-lg font-headline font-bold text-on-surface mb-4 pb-2 border-b border-surface-container-high">
            Squad Fitness
          </h3>
          <div className="space-y-1 overflow-y-auto max-h-[500px] pr-2">
            {trainingData.map((player) => {
              const fitness = player.skillBreakdown.find((s) => s.category === "physical");
              const fitnessValue = fitness ? Math.round((fitness.current / fitness.potential) * 100) : 100;
              const level = getFitnessLevel(fitnessValue);

              return (
                <div
                  key={player.playerId}
                  className="flex items-center justify-between p-2 rounded hover:bg-surface-container-high transition-colors group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-xs font-bold text-on-surface">
                      {getInitials(player.playerName)}
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-on-surface">{player.playerName}</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <div className="w-16 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                          <div className={`h-full ${level.bg}`} style={{ width: `${fitnessValue}%` }} />
                        </div>
                        <span className="text-[10px] text-on-surface-variant">{fitnessValue}%</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 bg-surface-container-highest ${level.color} text-[10px] font-bold rounded uppercase tracking-wider`}>
                    {level.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Section: Latest Training Report */}
      <div className="mt-6 bg-surface-container-low/75 backdrop-blur-xl border border-white/5 rounded-DEFAULT border border-outline-variant/15 p-6 shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
        <h3 className="text-xl font-headline font-bold text-on-surface mb-4">Latest Training Report</h3>
        <div className="space-y-3">
          {trainingData.slice(0, 5).map((player) => {
            const improvedSkills = player.skillBreakdown.filter(
              (s) => s.remainingToPotential > 0 && s.weeklyPoints > 0
            );
            if (improvedSkills.length === 0) return null;

            return (
              <div
                key={player.playerId}
                className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-surface-container-lowest rounded-DEFAULT border border-outline-variant/10 hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-center gap-4 mb-3 md:mb-0">
                  <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-sm font-bold text-on-surface">
                    {getInitials(player.playerName)}
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-on-surface">{player.playerName}</span>
                    <span className="text-xs text-on-surface-variant">{player.trainingSlot} Training</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-6 md:gap-8">
                  {improvedSkills.slice(0, 2).map((skill) => (
                    <div key={skill.skill} className="flex flex-col">
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">
                        {skill.category}
                      </span>
                      <div className="flex items-center gap-1.5 font-mono text-sm">
                        <span className="text-on-surface">{skill.current}</span>
                        <span className="material-symbols-outlined text-primary text-[16px]">arrow_forward</span>
                        <span className="text-primary font-bold">{skill.current + 1}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
