"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { api, type Player } from "@/lib/api";

const SKILL_COLORS = {
  physical: { bar: "bg-green-500", text: "text-green-500" },
  technical: { bar: "bg-blue-500", text: "text-blue-500" },
  mental: { bar: "bg-purple-500", text: "text-purple-500" },
  setPieces: { bar: "bg-amber-500", text: "text-amber-500" },
};

const SKILL_MAX = 20;

export default function SquadPage() {
  const t = useTranslations();
  const { user, team, isLoading: authLoading } = useAuth();
  const [players, setPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [filter, setFilter] = useState<"all" | "GK" | "outfield">("all");

  useEffect(() => {
    if (!team?.id) return;

    setIsLoading(true);
    api.players
      .getByTeam(team.id)
      .then((data) => {
        // Sort: GK first, then outfield by overall descending
        const sorted = data.items.sort((a, b) => {
          if (a.isGoalkeeper && !b.isGoalkeeper) return -1;
          if (!a.isGoalkeeper && b.isGoalkeeper) return 1;
          return b.overall - a.overall;
        });
        setPlayers(sorted);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [team?.id]);

  const filteredPlayers = players.filter((p) => {
    if (filter === "GK") return p.isGoalkeeper;
    if (filter === "outfield") return !p.isGoalkeeper;
    return true;
  });

  const getPositionLabel = (player: Player) => {
    return player.isGoalkeeper ? "GK" : "OUT";
  };

  const renderSkillBar = (label: string, value: number, color: string, potential?: number) => {
    const percentage = (value / SKILL_MAX) * 100;
    const potentialPercentage = potential ? (potential / SKILL_MAX) * 100 : 0;

    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-on-surface-variant">{label}</span>
          <span className="font-bold text-on-surface">{value}{potential ? <span className="text-on-surface-variant font-normal">/{potential}</span> : ""}</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden relative">
          <div
            className={`h-full rounded-full ${color} transition-all`}
            style={{ width: `${percentage}%` }}
          />
          {potential && potential > value && (
            <div
              className="absolute top-0 h-full bg-white/20 rounded-full"
              style={{ left: `${percentage}%`, width: `${potentialPercentage - percentage}%` }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderGKSkills = (player: Player) => {
    const skills = player.currentSkills;
    const potential = player.potentialSkills;

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Physical */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-green-500">
            Physical
          </h4>
          {renderSkillBar("Pace", skills.physical?.pace || 0, "bg-green-500", potential?.physical?.pace)}
          {renderSkillBar("Strength", skills.physical?.strength || 0, "bg-green-500", potential?.physical?.strength)}
        </div>

        {/* Technical */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-blue-500">
            Technical
          </h4>
          {renderSkillBar("Reflexes", skills.technical?.reflexes || 0, "bg-blue-500", potential?.technical?.reflexes)}
          {renderSkillBar("Handling", skills.technical?.handling || 0, "bg-blue-500", potential?.technical?.handling)}
          {renderSkillBar("Aerial", skills.technical?.aerial || 0, "bg-blue-500", potential?.technical?.aerial)}
        </div>

        {/* Mental */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-purple-500">
            Mental
          </h4>
          {renderSkillBar("Positioning", skills.mental?.positioning || 0, "bg-purple-500", potential?.mental?.positioning)}
          {renderSkillBar("Composure", skills.mental?.composure || 0, "bg-purple-500", potential?.mental?.composure)}
        </div>

        {/* Set Pieces */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-amber-500">
            Set Pieces
          </h4>
          {renderSkillBar("Free Kicks", skills.setPieces?.freeKicks || 0, "bg-amber-500", potential?.setPieces?.freeKicks)}
          {renderSkillBar("Penalties", skills.setPieces?.penalties || 0, "bg-amber-500", potential?.setPieces?.penalties)}
        </div>
      </div>
    );
  };

  const renderOutfieldSkills = (player: Player) => {
    const skills = player.currentSkills;
    const potential = player.potentialSkills;

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Physical */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-green-500">
            Physical
          </h4>
          {renderSkillBar("Pace", skills.physical?.pace || 0, "bg-green-500", potential?.physical?.pace)}
          {renderSkillBar("Strength", skills.physical?.strength || 0, "bg-green-500", potential?.physical?.strength)}
        </div>

        {/* Technical */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-blue-500">
            Technical
          </h4>
          {renderSkillBar("Finishing", skills.technical?.finishing || 0, "bg-blue-500", potential?.technical?.finishing)}
          {renderSkillBar("Passing", skills.technical?.passing || 0, "bg-blue-500", potential?.technical?.passing)}
          {renderSkillBar("Dribbling", skills.technical?.dribbling || 0, "bg-blue-500", potential?.technical?.dribbling)}
          {renderSkillBar("Defending", skills.technical?.defending || 0, "bg-blue-500", potential?.technical?.defending)}
        </div>

        {/* Mental */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-purple-500">
            Mental
          </h4>
          {renderSkillBar("Positioning", skills.mental?.positioning || 0, "bg-purple-500", potential?.mental?.positioning)}
          {renderSkillBar("Composure", skills.mental?.composure || 0, "bg-purple-500", potential?.mental?.composure)}
        </div>

        {/* Set Pieces */}
        <div className="space-y-3">
          <h4 className="font-label text-[10px] font-black uppercase tracking-widest text-amber-500">
            Set Pieces
          </h4>
          {renderSkillBar("Free Kicks", skills.setPieces?.freeKicks || 0, "bg-amber-500", potential?.setPieces?.freeKicks)}
          {renderSkillBar("Penalties", skills.setPieces?.penalties || 0, "bg-amber-500", potential?.setPieces?.penalties)}
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />

      <main className="flex-1 ml-64 flex flex-col">
        {/* Top AppBar */}
        <header className="h-16 bg-surface/70 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 shrink-0">
          <h1 className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary">
            Squad
          </h1>
          <div className="flex items-center gap-4">
            {/* Filter */}
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {(["all", "GK", "outfield"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-headline font-bold uppercase tracking-widest rounded-md transition-all ${
                    filter === f
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {f === "all" ? "All" : f === "GK" ? "GK" : "Field"}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Player List */}
              <div className="space-y-3">
                <h3 className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {filteredPlayers.length} Players
                </h3>
                <div className="space-y-2">
                  {filteredPlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => setSelectedPlayer(player)}
                      className={`w-full glass-panel rounded-xl p-4 flex items-center gap-4 text-left transition-all hover:bg-white/5 ${
                        selectedPlayer?.id === player.id ? "ring-1 ring-primary" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className="w-12 h-12 rounded-lg flex items-center justify-center font-headline font-black text-lg"
                        style={{
                          backgroundColor: `${team?.jerseyColorPrimary || "#00E479"}20`,
                          color: team?.jerseyColorPrimary || "#00E479",
                        }}
                      >
                        {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-headline text-sm font-bold text-on-surface truncate">
                            {player.name}
                          </span>
                          {player.isGoalkeeper && (
                            <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-500 text-[9px] font-bold rounded">
                              GK
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-on-surface-variant">
                          <span>{player.age}y</span>
                          <span>EXP {player.experience}</span>
                        </div>
                      </div>

                      {/* Overall */}
                      <div className="text-right">
                        <div className="font-headline text-2xl font-black text-primary">
                          {player.overall}
                        </div>
                        <div className="text-[9px] text-on-surface-variant uppercase tracking-widest">
                          Overall
                        </div>
                      </div>

                      {/* Stamina */}
                      <div className="w-16">
                        <div className="text-[9px] text-on-surface-variant uppercase tracking-widest mb-1">
                          Stam
                        </div>
                        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              player.stamina >= 7
                                ? "bg-green-500"
                                : player.stamina >= 4
                                ? "bg-amber-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${(player.stamina / 10) * 100}%` }}
                          />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Player Detail */}
              <div className="space-y-4">
                {selectedPlayer ? (
                  <>
                    <div className="glass-panel rounded-2xl p-6">
                      {/* Player Header */}
                      <div className="flex items-center gap-4 mb-6">
                        <div
                          className="w-20 h-20 rounded-xl flex items-center justify-center font-headline font-black text-3xl"
                          style={{
                            backgroundColor: `${team?.jerseyColorPrimary || "#00E479"}20`,
                            color: team?.jerseyColorPrimary || "#00E479",
                          }}
                        >
                          {selectedPlayer.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h2 className="font-headline text-xl font-black text-on-surface">
                              {selectedPlayer.name}
                            </h2>
                            {selectedPlayer.isGoalkeeper && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 text-xs font-bold rounded">
                                GK
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-on-surface-variant">
                            <span>{selectedPlayer.age} years old</span>
                            <span>EXP {selectedPlayer.experience}</span>
                          </div>
                        </div>
                        <div className="ml-auto text-right">
                          <div className="font-headline text-5xl font-black text-primary">
                            {selectedPlayer.overall}
                          </div>
                          <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                            Overall
                          </div>
                        </div>
                      </div>

                      {/* Stats Row */}
                      <div className="grid grid-cols-3 gap-4 p-4 bg-white/5 rounded-xl mb-6">
                        <div className="text-center">
                          <div className="font-headline text-2xl font-black text-green-500">
                            {selectedPlayer.stamina}
                          </div>
                          <div className="text-[9px] text-on-surface-variant uppercase tracking-widest">
                            Stamina
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="font-headline text-2xl font-black text-purple-500">
                            {selectedPlayer.form}
                          </div>
                          <div className="text-[9px] text-on-surface-variant uppercase tracking-widest">
                            Form
                          </div>
                        </div>
                        <div className="text-center">
                          <div className={`font-headline text-2xl font-black ${
                            selectedPlayer.potentialTier === "ELITE" ? "text-amber-400" :
                            selectedPlayer.potentialTier === "LEGEND" ? "text-purple-400" :
                            selectedPlayer.potentialTier === "HIGH_PRO" ? "text-green-400" :
                            "text-on-surface"
                          }`}>
                            {selectedPlayer.potentialAbility}
                          </div>
                          <div className="text-[9px] text-on-surface-variant uppercase tracking-widest">
                            Potential
                          </div>
                        </div>
                      </div>

                      {/* Skills */}
                      <div className="space-y-4">
                        <h3 className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                          Current Skills / Potential
                        </h3>
                        {selectedPlayer.isGoalkeeper
                          ? renderGKSkills(selectedPlayer)
                          : renderOutfieldSkills(selectedPlayer)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="glass-panel rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                    <span className="material-symbols-outlined text-6xl text-on-surface-variant/30 mb-4">
                      person
                    </span>
                    <p className="text-on-surface-variant">
                      Select a player to view details
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
