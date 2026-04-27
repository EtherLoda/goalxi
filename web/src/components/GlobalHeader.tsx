"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useGameStore } from "@/stores/gameStore";
import type { Team } from "@/lib/api";

interface GameState {
  season: number;
  week: number;
}

interface GlobalHeaderProps {
  locale: string;
}

export default function GlobalHeader({ locale }: GlobalHeaderProps) {
  const { team } = useAuth();
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { viewTeamId, setViewTeam, teamId } = useGameStore();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);
  const [viewedTeam, setViewedTeam] = useState<Team | null>(null);

  const isViewingMyTeam = viewTeamId === null || viewTeamId === teamId;

  // Sync URL params to Zustand on mount
  useEffect(() => {
    const urlTeamId = searchParams.get("team");
    if (urlTeamId) {
      setViewTeam(urlTeamId);
    }
  }, []);

  // Fetch viewed team info when viewing another team
  useEffect(() => {
    if (isViewingMyTeam || !viewTeamId) {
      setViewedTeam(null);
      return;
    }
    api.teams.getById(viewTeamId).then(setViewedTeam).catch(() => setViewedTeam(null));
  }, [viewTeamId, isViewingMyTeam]);

  // Display team: own team if viewing my team, otherwise the viewed team
  const displayTeam = isViewingMyTeam ? team : viewedTeam;

  useEffect(() => {
    api.game.getCurrent().then(setGameState).catch(() => null);
  }, []);

  useEffect(() => {
    const leagueIdToFetch = team?.leagueId || viewedTeam?.leagueId;
    if (leagueIdToFetch) {
      api.leagues.getById(leagueIdToFetch).then((league) => setLeagueName(league.name)).catch(() => null);
    }
  }, [team?.leagueId, viewedTeam?.leagueId]);

  const leagueId = team?.leagueId;
  const totalMatchweeks = 16;
  const isTransfersPage = pathname?.startsWith(`/${locale}/transfers`);

  return (
    <header className="h-16 bg-surface/70 backdrop-blur-2xl border-b border-white/5 flex items-center px-6 relative">
      {/* Left: League + Team */}
      <div className="flex items-center gap-6">
        {displayTeam?.leagueId && leagueName ? (
          <Link
            href={`/${locale}/league/${displayTeam.leagueId}`}
            className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary hover:text-primary/80 transition-colors"
          >
            {leagueName}
          </Link>
        ) : (
          <span className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary/50">
            League
          </span>
        )}
        <span className="text-white/20">|</span>
        {team && !isViewingMyTeam ? (
          <button
            onClick={() => {
              setViewTeam(teamId);
              router.push(`/${locale}/dashboard?team=${teamId}`);
            }}
            className="font-headline font-black text-sm uppercase tracking-[0.2em] text-on-surface hover:text-primary transition-colors flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            {team.name || "Team"}
          </button>
        ) : (
          <span className="font-headline font-black text-sm uppercase tracking-[0.2em] text-on-surface/70">
            {displayTeam?.name || "Team"}
          </span>
        )}
      </div>

      {/* Center: Transfers tabs (on any transfers page) */}
      {isTransfersPage && (
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-8">
          <Link
            href={`/${locale}/transfers`}
            className={`text-xs font-bold pb-1 transition-colors border-b-2 ${
              pathname === `/${locale}/transfers`
                ? "text-primary border-primary"
                : "text-on-surface-variant border-transparent hover:text-primary hover:border-primary/50"
            }`}
          >
            Market
          </Link>
          <Link
            href={`/${locale}/transfers/shortlist`}
            className={`text-xs font-bold pb-1 transition-colors border-b-2 ${
              pathname === `/${locale}/transfers/shortlist`
                ? "text-primary border-primary"
                : "text-on-surface-variant border-transparent hover:text-primary hover:border-primary/50"
            }`}
          >
            Shortlist
          </Link>
          <Link
            href={`/${locale}/transfers/history`}
            className={`text-xs font-bold pb-1 transition-colors border-b-2 ${
              pathname === `/${locale}/transfers/history`
                ? "text-primary border-primary"
                : "text-on-surface-variant border-transparent hover:text-primary hover:border-primary/50"
            }`}
          >
            History
          </Link>
        </nav>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: Season Badge + Icons */}
      <div className="flex items-center gap-4">
        {gameState && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-white/5">
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-primary">
              S{gameState.season}
            </span>
            <span className="w-px h-3 bg-white/10" />
            <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              MW{gameState.week}/{totalMatchweeks}
            </span>
          </div>
        )}

        {/* Market icon */}
        <Link
          href={`/${locale}/transfers`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
        >
          <span className="material-symbols-outlined">storefront</span>
        </Link>

        {/* Messages icon */}
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors">
          <span className="material-symbols-outlined">mail</span>
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
        </button>

        {/* Settings icon */}
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>

        {/* Search icon */}
        <Link
          href={`/${locale}/search`}
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
        >
          <span className="material-symbols-outlined">search</span>
        </Link>
      </div>
    </header>
  );
}
