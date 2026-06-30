"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  api,
  type YouthMatch,
  type YouthMatchEvent,
  type YouthPlayer,
  type YouthTactics,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import YouthTacticsEditor from "@/components/youth/YouthTacticsEditor";

// Material Symbols names for the event types we care about (from simulator
// mapEventType). Fallback is a generic icon.
const EVENT_ICON: Record<string, string> = {
  goal: "sports_soccer",
  shot_on_target: "target",
  miss: "highlight_off",
  yellow_card: "credit_card",
  red_card: "credit_card_off",
  substitution: "swap_horiz",
  foul: "whistle",
  save: "back_hand",
  injury: "medical_services",
  half_time: "pause",
  full_time: "flag",
  kickoff: "play_arrow",
  penalty_goal: "sports_score",
  penalty_miss: "block",
  offside: "do_not_disturb_on",
  corner: "rotate_right",
  free_kick: "adjust",
  turnover: "change_circle",
  second_half: "play_circle",
};

const EVENT_COLOR: Record<string, string> = {
  goal: "text-[#34d399] bg-[#34d399]/10",
  shot_on_target: "text-[#a1ffc2] bg-[#a1ffc2]/10",
  miss: "text-[#91b2a6] bg-[#91b2a6]/10",
  yellow_card: "text-[#fbbf24] bg-[#fbbf24]/10",
  red_card: "text-[#ef4444] bg-[#ef4444]/10",
  substitution: "text-[#60a5fa] bg-[#60a5fa]/10",
  foul: "text-[#fbbf24] bg-[#fbbf24]/10",
  save: "text-[#a78bfa] bg-[#a78bfa]/10",
  injury: "text-[#ef4444] bg-[#ef4444]/10",
  half_time: "text-[#91b2a6] bg-[#91b2a6]/10",
  full_time: "text-[#a1ffc2] bg-[#a1ffc2]/10",
  penalty_goal: "text-[#34d399] bg-[#34d399]/10",
  penalty_miss: "text-[#ef4444] bg-[#ef4444]/10",
};

export default function YouthMatchDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = useTranslations("youth.matches");
  const tEvents = useTranslations("youth.matches.events");
  const tTactics = useTranslations("youth.matches.tactics");
  const tCommon = useTranslations("common");
  const routeParams = useParams();
  const search = useSearchParams();
  const { team } = useAuth();

  const locale = (routeParams.locale as string) || "en";
  const teamIdParam = search.get("team") ?? team?.id ?? "";

  const [match, setMatch] = useState<YouthMatch | null>(null);
  const [events, setEvents] = useState<YouthMatchEvent[]>([]);
  const [homeTactics, setHomeTactics] = useState<YouthTactics | null>(null);
  const [awayTactics, setAwayTactics] = useState<YouthTactics | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<YouthPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      api.youthMatches.get(params.id),
      api.youthMatches.getEvents(params.id).catch(() => [] as YouthMatchEvent[]),
      api.youthMatches.getTactics(params.id).catch(() => ({
        homeTactics: null,
        awayTactics: null,
      })),
      api.youthPlayers.list().catch(() => [] as YouthPlayer[]),
    ])
      .then(([m, ev, tc, roster]) => {
        if (cancelled) return;
        setMatch(m);
        setEvents(ev);
        setHomeTactics(tc.homeTactics);
        setAwayTactics(tc.awayTactics);
        setAvailablePlayers(roster);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  // Determine which side the user controls. We treat the user's senior
  // team as the canonical match participant; the youth team is implicit
  // (1:1 mapping). Side = home if the user's team is the home side.
  // The backend doesn't expose the senior-team→youth-team mapping on the
  // match DTO, so we use a simple heuristic: compare `match.homeYouthTeamId`
  // to the available youth players (whose teamId is the user's senior team).
  // Since we don't have the senior team id on the player side here, we
  // default to "home" — the API submit endpoint will reject if the user
  // doesn't own the youth team anyway.
  const userSide: "home" | "away" = "home";

  const refetchAll = async () => {
    const [m, ev, tc] = await Promise.all([
      api.youthMatches.get(params.id),
      api.youthMatches.getEvents(params.id).catch(() => [] as YouthMatchEvent[]),
      api.youthMatches.getTactics(params.id).catch(() => ({
        homeTactics: null,
        awayTactics: null,
      })),
    ]);
    setMatch(m);
    setEvents(ev);
    setHomeTactics(tc.homeTactics);
    setAwayTactics(tc.awayTactics);
  };

  // For matches the user can still affect (scheduled or tactics_locked but
  // before the actual kickoff) show the editor. Otherwise fall back to
  // the read-only tactics view.
  const showEditor =
    match != null &&
    (match.status === "scheduled" || match.status === "tactics_locked") &&
    new Date(match.scheduledAt).getTime() > Date.now();
  const myTactics = userSide === "home" ? homeTactics : awayTactics;

  if (error) {
    return (
      <div className="px-8 py-6">
        <div className="bg-error/10 border border-error/30 rounded-xl p-6 text-error text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="px-8 py-6">
        <div className="text-[#91b2a6] text-sm font-space">Loading…</div>
      </div>
    );
  }

  const home = match.homeYouthTeam?.name ?? "?";
  const away = match.awayYouthTeam?.name ?? "?";
  const finished =
    match.status === "completed" || match.status === "cancelled";
  const cancelled = match.status === "cancelled";

  return (
    <div className="px-8 py-6 space-y-6">
      <Link
        href={`/${locale}/youth/matches?team=${teamIdParam}`}
        className="inline-flex items-center gap-1 text-xs text-[#91b2a6] hover:text-[#a1ffc2] transition-colors font-space"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to matches
      </Link>

      {/* Header */}
      <header className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-6">
        <p className="text-[10px] text-[#91b2a6] font-bold uppercase tracking-wider">
          {t("weekRound", { season: match.season, week: match.week })}
        </p>
        <div className="mt-2 flex flex-col items-center gap-3 md:flex-row md:justify-between">
          <div className="text-center md:text-right md:flex-1">
            <p className="text-lg font-bold text-[#d3f5e8]">{home}</p>
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider font-bold mt-1">
              {tEvents("home")}
            </p>
          </div>
          <div className="flex flex-col items-center px-6">
            {cancelled ? (
              <span className="text-base font-black text-[#91b2a6] uppercase">
                Cancelled
              </span>
            ) : (
              <span className="text-4xl font-black font-space text-[#d3f5e8] tabular-nums">
                {match.homeScore ?? 0}
                <span className="text-[#91b2a6] mx-2">-</span>
                {match.awayScore ?? 0}
              </span>
            )}
            <span
              className={
                finished
                  ? "text-[10px] uppercase tracking-wider font-bold text-[#91b2a6] mt-1"
                  : match.status === "in_progress"
                    ? "text-[10px] uppercase tracking-wider font-bold text-[#ef4444] mt-1 animate-pulse"
                    : match.status === "tactics_locked"
                      ? "text-[10px] uppercase tracking-wider font-bold text-[#fbbf24] mt-1"
                      : "text-[10px] uppercase tracking-wider font-bold text-[#a1ffc2] mt-1"
              }
            >
              {match.status}
            </span>
          </div>
          <div className="text-center md:text-left md:flex-1">
            <p className="text-lg font-bold text-[#d3f5e8]">{away}</p>
            <p className="text-[10px] text-[#91b2a6] uppercase tracking-wider font-bold mt-1">
              {tEvents("away")}
            </p>
          </div>
        </div>
        <p className="text-center text-[11px] text-[#91b2a6] font-space mt-3">
          {t("scheduled", {
            time: new Date(match.scheduledAt).toLocaleString(locale),
          })}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tactics */}
        <section className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#91b2a6] mb-3">
            {tTactics("title")}
          </h2>

          {/* User-side tactics: editor (if upcoming) or read-only summary */}
          {showEditor ? (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider font-bold text-[#a1ffc2] mb-2">
                {userSide === "home" ? tEvents("home") : tEvents("away")} ·{" "}
                {t("youAreHome")}
              </p>
              <YouthTacticsEditor
                match={match}
                side={userSide}
                initialTactics={myTactics}
                availablePlayers={availablePlayers}
                tMatches={t}
                tCommon={tCommon}
                onSubmitted={refetchAll}
              />
            </div>
          ) : (
            <TacticsBlock
              label={home}
              side="home"
              tactics={homeTactics}
              tTactics={tTactics}
            />
          )}

          {/* Opponent-side is always read-only */}
          <div className="my-3 border-t border-white/5" />
          <TacticsBlock
            label={away}
            side="away"
            tactics={awayTactics}
            tTactics={tTactics}
          />
        </section>

        {/* Events */}
        <section className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#91b2a6] mb-3">
            {tEvents("title")}
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-[#91b2a6] font-space">
              {tEvents("noEvents")}
            </p>
          ) : (
            <ul className="space-y-2 max-h-[480px] overflow-y-auto">
              {events.map((e) => (
                <EventRow
                  key={e.id}
                  e={e}
                  home={home}
                  away={away}
                  tEvents={tEvents}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TacticsBlock({
  label,
  side,
  tactics,
  tTactics,
}: {
  label: string;
  side: "home" | "away";
  tactics: YouthTactics | null;
  tTactics: ReturnType<typeof useTranslations>;
}) {
  if (!tactics) {
    return (
      <div>
        <p className="text-xs font-bold text-[#d3f5e8] mb-1">{label}</p>
        <p className="text-[11px] text-[#91b2a6] font-space italic">
          {tTactics("notSubmitted")}
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="text-xs font-bold text-[#d3f5e8] mb-1">{label}</p>
      <p className="text-[11px] text-[#91b2a6] font-space">
        {tTactics("formation", { formation: tactics.formation })}
      </p>
      <p className="text-[10px] text-[#91b2a6] font-space mt-0.5">
        {tTactics("lineupCount", {
          count: Object.keys(tactics.lineup).length,
        })}
      </p>
    </div>
  );
}

function EventRow({
  e,
  home,
  away,
  tEvents,
}: {
  e: YouthMatchEvent;
  home: string;
  away: string;
  tEvents: ReturnType<typeof useTranslations>;
}) {
  if (!e.isRevealed) {
    return (
      <li className="flex items-center gap-3 p-2 rounded-lg bg-[#001e17]/40">
        <span className="w-7 h-7 rounded-full bg-[#2f4e44]/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-[#2f4e44] text-sm">
            visibility_off
          </span>
        </span>
        <div className="flex-1 text-[11px] text-[#91b2a6] font-space">
          <span className="font-bold tabular-nums">{e.minute}'</span> ·{" "}
          {tEvents("fog", { side: e.isHome === false ? tEvents("away") : tEvents("home") })}
        </div>
      </li>
    );
  }

  const sideName = e.isHome ? home : away;
  const colorClass =
    EVENT_COLOR[e.typeName] ?? "text-[#d3f5e8] bg-[#d3f5e8]/10";
  const icon = EVENT_ICON[e.typeName] ?? "info";

  return (
    <li className="flex items-center gap-3 p-2 rounded-lg bg-[#001e17]">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}
      >
        <span className="material-symbols-outlined text-sm">{icon}</span>
      </span>
      <div className="flex-1 text-xs text-[#d3f5e8] font-space min-w-0">
        <p className="font-bold truncate">
          <span className="tabular-nums mr-2 text-[#91b2a6]">{e.minute}'</span>
          {e.typeName.replace(/_/g, " ")}
        </p>
        <p className="text-[10px] text-[#91b2a6]">{sideName}</p>
      </div>
    </li>
  );
}