"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type YouthMatch } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

type TabKey = "upcoming" | "thisWeek" | "completed";

export default function YouthMatchesPage() {
  const t = useTranslations("youth.matches");
  const tTabs = useTranslations("youth.matches.tabs");
  const params = useParams();
  const search = useSearchParams();
  const { team } = useAuth();

  const locale = (params.locale as string) || "en";
  const viewTeamId = search.get("team");
  const isOwnTeam = !viewTeamId || viewTeamId === team?.id;

  const [all, setAll] = useState<YouthMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("upcoming");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.youthMatches
      .list({ limit: 50, teamId: viewTeamId ?? undefined })
      .then((data) => {
        if (!cancelled) setAll(data.items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
          setAll([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [viewTeamId]);

  const filtered = useMemo(() => {
    if (!all) return [];
    const now = Date.now();
    return all.filter((m) => {
      const ts = new Date(m.scheduledAt).getTime();
      if (tab === "upcoming")
        return (
          (m.status === "scheduled" || m.status === "tactics_locked") &&
          ts >= now - 7 * 24 * 60 * 60 * 1000 // include in-progress + recent
        );
      if (tab === "thisWeek") {
        const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
        const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
        return ts >= weekAgo && ts <= weekAhead;
      }
      return m.status === "completed" || m.status === "cancelled";
    });
  }, [all, tab]);

  return (
    <div className="px-8 py-6 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black font-space text-[#d3f5e8] tracking-tight">
            {t("title")}
          </h1>
        </div>
        {!isOwnTeam && (
          <span className="text-xs text-[#fbbf24] font-space">
            Viewing another team (read-only)
          </span>
        )}
      </header>

      <div className="flex items-center gap-1 border-b border-white/5">
        {(["upcoming", "thisWeek", "completed"] as TabKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              tab === k
                ? "px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#a1ffc2] border-b-2 border-[#a1ffc2]"
                : "px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[#91b2a6] hover:text-[#d3f5e8] transition-colors"
            }
          >
            {tTabs(k)}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-6 text-error text-sm">
          {error}
        </div>
      )}

      {all && filtered.length === 0 && !error && (
        <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 px-6 py-16 text-center">
          <span className="material-symbols-outlined text-[#91b2a6] text-5xl">
            sports
          </span>
          <p className="mt-4 text-sm text-[#91b2a6] font-space">
            {t("noMatches")}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              t={t}
              locale={locale}
              teamIdParam={viewTeamId ?? team?.id ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchRow({
  m,
  t,
  locale,
  teamIdParam,
}: {
  m: YouthMatch;
  t: ReturnType<typeof useTranslations>;
  locale: string;
  teamIdParam: string;
}) {
  const home = m.homeYouthTeam?.name ?? "?";
  const away = m.awayYouthTeam?.name ?? "?";
  const finished = m.status === "completed" || m.status === "cancelled";
  const cancelled = m.status === "cancelled";

  return (
    <Link
      href={`/${locale}/youth/matches/${m.id}?team=${teamIdParam}`}
      className="block bg-[#00251c]/60 rounded-xl border border-white/5 p-4 hover:bg-[#00251c]/80 transition-colors"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#d3f5e8] truncate">
              {home}
              <span className="text-[#91b2a6] mx-2 text-xs">vs</span>
              {away}
            </p>
            <p className="text-[10px] text-[#91b2a6] font-space mt-0.5">
              {t("weekRound", { season: m.season, week: m.week })} ·{" "}
              {new Date(m.scheduledAt).toLocaleString(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {finished ? (
            cancelled ? (
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#91b2a6]">
                Cancelled
              </span>
            ) : (
              <span className="text-lg font-black font-space text-[#d3f5e8] tabular-nums">
                {m.homeScore ?? 0}
                <span className="text-[#91b2a6] mx-1.5">-</span>
                {m.awayScore ?? 0}
              </span>
            )
          ) : (
            <span
              className={
                m.status === "tactics_locked"
                  ? "text-[10px] uppercase tracking-wider font-bold text-[#fbbf24] px-2 py-0.5 rounded bg-[#fbbf24]/10"
                  : "text-[10px] uppercase tracking-wider font-bold text-[#91b2a6] px-2 py-0.5 rounded bg-[#91b2a6]/10"
              }
            >
              {m.status === "tactics_locked" ? "Locked" : "Scheduled"}
            </span>
          )}
          <span className="material-symbols-outlined text-[#91b2a6] text-lg">
            chevron_right
          </span>
        </div>
      </div>
    </Link>
  );
}