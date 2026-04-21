"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useParams, usePathname } from "next/navigation";

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
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);

  useEffect(() => {
    api.game.getCurrent().then(setGameState).catch(() => null);
  }, []);

  useEffect(() => {
    if (team?.leagueId) {
      api.leagues.getById(team.leagueId).then((league) => setLeagueName(league.name)).catch(() => null);
    }
  }, [team?.leagueId]);

  const leagueId = team?.leagueId;
  const totalMatchweeks = 16;
  const isTransfersPage = pathname?.startsWith(`/${locale}/transfers`);

  return (
    <header className="h-16 bg-surface/70 backdrop-blur-2xl border-b border-white/5 flex items-center px-6 relative">
      {/* Left: League + Team */}
      <div className="flex items-center gap-6">
        {leagueId && leagueName ? (
          <Link
            href={`/${locale}/league/${leagueId}`}
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
        <Link
          href={`/${locale}/dashboard`}
          className="font-headline font-black text-sm uppercase tracking-[0.2em] text-on-surface hover:text-primary transition-colors"
        >
          {team?.name || "Team"}
        </Link>
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
      </div>
    </header>
  );
}
