"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useGameStore } from "@/stores/gameStore";
import { AppIcon } from "@/components/icons/AppIcon";
import type { Team } from "@/lib/api";

interface GameState {
  season: number;
  week: number;
  /** Weeks in the regular season — what "MW{n}/{total}" should count to. */
  regularSeasonWeeks: number;
}

interface GlobalHeaderProps {
  locale: string;
}

const SETTINGS_SECTIONS = [
  { slug: "team", icon: "shield" },
  { slug: "user", icon: "account_circle" },
  { slug: "site", icon: "public" },
] as const;

function SettingsMenu({ locale }: { locale: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Click-outside / Escape close. The native dialog element would do this
  // for free, but it brings focus-trap semantics we don't need for a tiny
  // popover, and a11y-wise the popover is still keyboard-navigable
  // (Escape → blur, Tab cycles through the 3 links).
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Settings"
        title="Settings"
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
      >
        <AppIcon name="settings" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-white/10 bg-surface/95 backdrop-blur-2xl shadow-2xl py-1.5 z-50"
        >
          {SETTINGS_SECTIONS.map((s) => (
            <Link
              key={s.slug}
              role="menuitem"
              href={`/${locale}/settings/${s.slug}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 font-headline text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-white/5 transition-colors"
            >
              <AppIcon name={s.icon} className="text-base" />
              <span>{s.slug}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GlobalHeader({ locale }: GlobalHeaderProps) {
  const { team } = useAuth();
  const t = useTranslations("header");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { viewTeamId, setViewTeam, clearViewTeam, teamId, teamName } =
    useGameStore();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [leagueName, setLeagueName] = useState<string | null>(null);

  const isViewingMyTeam = viewTeamId === null || viewTeamId === teamId;

  // The URL owns "whose dashboard is this" — react to query changes, not just
  // the first mount, or a ?team=A -> ?team=B navigation leaves the header
  // showing the previous club.
  const urlTeamId = searchParams.get("team");
  useEffect(() => {
    if (urlTeamId) {
      setViewTeam(urlTeamId);
    }
  }, [urlTeamId, setViewTeam]);

  // Fetch viewed team info when viewing another team. State holds only the
  // fetched club; "am I viewing someone else" is derived, so the effect never
  // has to reset state synchronously.
  const [fetchedViewTeam, setFetchedViewTeam] = useState<Team | null>(null);
  useEffect(() => {
    if (isViewingMyTeam || !viewTeamId) return;
    let cancelled = false;
    api.teams
      .getById(viewTeamId)
      .then((t) => {
        if (!cancelled) setFetchedViewTeam(t);
      })
      .catch(() => {
        if (!cancelled) setFetchedViewTeam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewTeamId, isViewingMyTeam]);

  const viewedTeam = isViewingMyTeam ? null : fetchedViewTeam;

  // The header chrome describes YOU, never the club you happen to be looking
  // at. `useAuth().team` is your own club; `viewedTeam` is the other one, and
  // it belongs in its own chip so the two can never be confused.
  const ownTeamId = team?.id ?? teamId;
  const ownTeamName = team?.name ?? (teamName || null);

  useEffect(() => {
    api.game.getCurrent().then(setGameState).catch(() => null);
  }, []);

  useEffect(() => {
    const ownLeagueId = team?.leagueId;
    if (ownLeagueId) {
      api.leagues.getById(ownLeagueId).then((league) => setLeagueName(league.name)).catch(() => null);
    }
  }, [team?.leagueId]);

  // From the API, not a literal. This used to be a hardcoded 16, so once
  // the season was compressed to 11 weeks the badge read "MW16/16" for
  // the rest of the season and the progress was meaningless.
  const totalMatchweeks = gameState?.regularSeasonWeeks ?? 0;

  const goHome = () => {
    clearViewTeam();
    router.push(`/${locale}/dashboard${ownTeamId ? `?team=${ownTeamId}` : ""}`);
  };

  return (
    <header className="h-16 bg-surface/70 backdrop-blur-2xl border-b border-white/5 flex items-center px-6 relative">
      {/* Left: your league + your club. These are identity, not navigation
          context — showing the browsed club here made the header claim you
          had switched jobs. */}
      <div className="flex items-center gap-6">
        {team?.leagueId && leagueName ? (
          <Link
            href={`/${locale}/league/${team.leagueId}`}
            className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary hover:text-primary/80 transition-colors"
          >
            {leagueName}
          </Link>
        ) : (
          <span className="font-headline font-black text-sm uppercase tracking-[0.2em] text-primary/50">
            League
          </span>
        )}
        <span className="text-on-surface/20">|</span>
        <button
          type="button"
          onClick={goHome}
          title={t("myClub")}
          className="font-headline font-black text-sm uppercase tracking-[0.2em] text-on-surface hover:text-primary transition-colors"
        >
          {ownTeamName || "Team"}
        </button>

        {/* The browsed club, kept clearly separate from your own name and
            always exitable — this is the way back that view mode was missing. */}
        {!isViewingMyTeam && (
          <span className="flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 pl-3 pr-1 py-1">
            <span className="font-label text-kicker font-black uppercase tracking-widest text-primary/80">
              {t("viewing")}
            </span>
            <span className="font-headline text-label font-bold text-on-surface truncate max-w-[160px]">
              {viewedTeam?.name ?? "…"}
            </span>
            <button
              type="button"
              onClick={goHome}
              aria-label={t("exitView")}
              title={t("exitView")}
              className="w-6 h-6 rounded-full flex items-center justify-center text-primary hover:bg-primary/20 transition-colors"
            >
              <AppIcon name="close" className="text-sm" />
            </button>
          </span>
        )}
      </div>

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
          aria-label="Market"
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
        >
          <AppIcon name="storefront" />
        </Link>

        {/* Messages icon */}
        <button
          aria-label="Messages"
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
        >
          <AppIcon name="mail" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
        </button>

        {/* Settings menu — opens a popover with Team / User / Site entries.
            Direct deep-link is still available via /:locale/settings/<slug>. */}
        <SettingsMenu locale={locale} />

        {/* Search icon */}
        <Link
          href={`/${locale}/search`}
          aria-label="Search"
          className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-white/5 transition-colors"
        >
          <AppIcon name="search" />
        </Link>
      </div>
    </header>
  );
}
