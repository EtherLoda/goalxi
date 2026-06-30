"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type YouthPlayer, type User } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/** Skill keys total per player type — used to compute reveal progress. */
const OUTFIELD_KEYS = [
  "pace",
  "strength",
  "finishing",
  "passing",
  "dribbling",
  "defending",
  "positioning",
  "composure",
  "freeKicks",
  "penalties",
];
const GK_KEYS = [
  "pace",
  "strength",
  "reflexes",
  "handling",
  "aerial",
  "positioning",
  "composure",
  "freeKicks",
  "penalties",
];

function getExpectedKeyCount(p: YouthPlayer): number {
  return p.isGoalkeeper ? GK_KEYS.length : OUTFIELD_KEYS.length;
}

function getRequiredRevealCount(p: YouthPlayer): number {
  // Promotion gate is ceil(50% of expected keys) — see YouthController.promote.
  return Math.ceil(getExpectedKeyCount(p) * 0.5);
}

const POTENTIAL_TIER_COLOR: Record<string, string> = {
  LOW: "text-[#91b2a6] bg-[#91b2a6]/10",
  REGULAR: "text-[#a1ffc2] bg-[#a1ffc2]/10",
  HIGH_PRO: "text-[#fbbf24] bg-[#fbbf24]/10",
  ELITE: "text-[#f472b6] bg-[#f472b6]/10",
  LEGEND: "text-[#a78bfa] bg-[#a78bfa]/10",
};

type ViewMode = "table" | "cards";

export default function YouthSquadPage() {
  const t = useTranslations("youth.squad");
  const tPos = useTranslations("youth.squad.position");
  const tPot = useTranslations("youth.squad.potentialLabel");
  const params = useParams();
  const search = useSearchParams();
  const { user, team } = useAuth();

  const locale = (params.locale as string) || "en";
  const teamIdFromQuery = search.get("team");
  const viewTeamId = teamIdFromQuery; // future: when viewing another team

  const [players, setPlayers] = useState<YouthPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const [promoting, setPromoting] = useState<YouthPlayer | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  // Only the team owner can manage their own youth squad — sidebar links
  // to /youth/squad always go to the user's own team; viewing another
  // team's squad is read-only in a future iteration.
  const isOwnTeam = !viewTeamId || viewTeamId === team?.id;

  useEffect(() => {
    let cancelled = false;
    setError(null);

    // The youth controller is class-level @UseGuards(AuthGuard) so a logged-in
    // user is sufficient. If we're viewing another team's squad we still
    // hit the endpoint; the backend would currently return 403 — for now we
    // degrade gracefully and show "no players".
    api.youthPlayers
      .list()
      .then((data) => {
        if (!cancelled) setPlayers(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
          setPlayers([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sorted = useMemo(() => {
    if (!players) return [];
    return [...players].sort((a, b) => {
      // Active youth first, then by reveal progress desc, then by potential tier desc, then by joinedAt desc.
      if (a.isPromoted !== b.isPromoted) return a.isPromoted ? 1 : -1;
      const pa = a.revealedSkills.length / Math.max(1, getExpectedKeyCount(a));
      const pb = b.revealedSkills.length / Math.max(1, getExpectedKeyCount(b));
      if (pa !== pb) return pb - pa;
      const tierOrder: Record<string, number> = {
        LEGEND: 5,
        ELITE: 4,
        HIGH_PRO: 3,
        REGULAR: 2,
        LOW: 1,
      };
      return (
        (tierOrder[b.potentialTier ?? "LOW"] ?? 0) -
        (tierOrder[a.potentialTier ?? "LOW"] ?? 0)
      );
    });
  }, [players]);

  const handlePromote = async (p: YouthPlayer) => {
    setPromoting(p);
    setToast(null);
    try {
      await api.youthPlayers.promote(p.id);
      setToast({ kind: "success", text: t("promoteSuccess", { name: p.name }) });
      // Refresh list — promoted player disappears from /youth-players.
      const fresh = await api.youthPlayers.list();
      setPlayers(fresh);
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : t("promoteError"),
      });
    } finally {
      setPromoting(null);
    }
  };

  // -------- Render --------
  if (error) {
    return (
      <div className="px-8 py-6">
        <div className="bg-error/10 border border-error/30 rounded-xl p-6 text-error">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6 space-y-6">
      <Header
        title={t("title")}
        subtitle={t("subtitle")}
        count={sorted.length}
        countLabel={t("totalPlayers", { count: sorted.length })}
        view={view}
        onViewChange={setView}
      />

      {sorted.length === 0 && (
        <EmptyState text={t("empty")} />
      )}

      {sorted.length > 0 && view === "table" && (
        <TableView
          t={t}
          tPos={tPos}
          tPot={tPot}
          players={sorted}
          isOwnTeam={isOwnTeam}
          locale={locale}
          promoting={promoting}
          onPromote={handlePromote}
        />
      )}

      {sorted.length > 0 && view === "cards" && (
        <CardsView
          t={t}
          tPos={tPos}
          tPot={tPot}
          players={sorted}
          isOwnTeam={isOwnTeam}
          locale={locale}
          promoting={promoting}
          onPromote={handlePromote}
        />
      )}

      {toast && (
        <Toast
          kind={toast.kind}
          text={toast.text}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

// ---------- Subcomponents ----------

function Header({
  title,
  subtitle,
  count,
  countLabel,
  view,
  onViewChange,
}: {
  title: string;
  subtitle: string;
  count: number;
  countLabel: string;
  view: ViewMode;
  onViewChange: (v: ViewMode) => void;
}) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-black font-space text-[#d3f5e8] tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-[#91b2a6] font-space mt-1">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-[11px] uppercase tracking-wider font-bold text-[#91b2a6]">
          {countLabel}
        </span>
        <div className="inline-flex rounded-lg border border-white/5 overflow-hidden">
          {(["table", "cards"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              className={
                view === v
                  ? "px-3 py-1.5 bg-[#a1ffc2] text-[#001e17] text-xs font-bold uppercase tracking-wider"
                  : "px-3 py-1.5 text-[#91b2a6] hover:bg-white/5 text-xs font-bold uppercase tracking-wider"
              }
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 px-6 py-16 text-center">
      <span className="material-symbols-outlined text-[#91b2a6] text-5xl">
        child_care
      </span>
      <p className="mt-4 text-sm text-[#91b2a6] font-space">{text}</p>
    </div>
  );
}

function PlayerMeta({
  p,
  tPot,
}: {
  p: YouthPlayer;
  tPot: ReturnType<typeof useTranslations>;
}) {
  const tier = p.potentialTier;
  const tierClass = tier
    ? POTENTIAL_TIER_COLOR[tier] ?? POTENTIAL_TIER_COLOR.LOW
    : "bg-[#2f4e44]/40 text-[#91b2a6]";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tierClass}`}
    >
      {p.potentialRevealed && tier ? tPot(tier) : "?"}
    </span>
  );
}

function RevealProgressBar({
  p,
  t,
}: {
  p: YouthPlayer;
  t: ReturnType<typeof useTranslations>;
}) {
  const total = getExpectedKeyCount(p);
  const cur = p.revealedSkills.length;
  const pct = total > 0 ? (cur / total) * 100 : 0;
  const ready = cur >= getRequiredRevealCount(p);
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-1.5 rounded-full bg-[#00251c] overflow-hidden">
        <div
          className={
            ready
              ? "h-full bg-[#a1ffc2]"
              : "h-full bg-gradient-to-r from-[#a78bfa] to-[#60a5fa]"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={
          ready
            ? "text-[10px] font-bold text-[#a1ffc2] tabular-nums"
            : "text-[10px] font-bold text-[#91b2a6] tabular-nums"
        }
      >
        {t("revealProgress", { current: cur, total })}
      </span>
    </div>
  );
}

function AgeCell({
  p,
  t,
}: {
  p: YouthPlayer;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <span className="text-xs text-[#d3f5e8] tabular-nums">
      {p.age}
      <span className="text-[10px] text-[#91b2a6] ml-1">
        ({p.revealLevel})
      </span>
    </span>
  );
}

function TableView({
  t,
  tPos,
  tPot,
  players,
  isOwnTeam,
  locale,
  promoting,
  onPromote,
}: {
  t: ReturnType<typeof useTranslations>;
  tPos: ReturnType<typeof useTranslations>;
  tPot: ReturnType<typeof useTranslations>;
  players: YouthPlayer[];
  isOwnTeam: boolean;
  locale: string;
  promoting: YouthPlayer | null;
  onPromote: (p: YouthPlayer) => void;
}) {
  return (
    <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-[#001e17] text-[10px] uppercase tracking-wider text-[#91b2a6]">
          <tr>
            <th className="px-4 py-3 font-bold">{t("columns.name")}</th>
            <th className="px-4 py-3 font-bold">{t("columns.age")}</th>
            <th className="px-4 py-3 font-bold">{t("columns.nationality")}</th>
            <th className="px-4 py-3 font-bold">{t("columns.position")}</th>
            <th className="px-4 py-3 font-bold">{t("columns.potential")}</th>
            <th className="px-4 py-3 font-bold">{t("columns.revealed")}</th>
            <th className="px-4 py-3 font-bold text-right">
              {t("columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {players.map((p) => {
            const canPromote =
              isOwnTeam &&
              p.revealedSkills.length >= getRequiredRevealCount(p) &&
              !p.isPromoted;
            return (
              <tr
                key={p.id}
                className="hover:bg-white/[0.03] transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/${locale}/youth/players/${p.id}?team=${p.isPromoted ? "" : ""}`}
                    className="text-sm font-bold text-[#d3f5e8] hover:text-[#a1ffc2] transition-colors"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <AgeCell p={p} t={t} />
                </td>
                <td className="px-4 py-3 text-xs text-[#91b2a6]">
                  {p.nationality ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs text-[#91b2a6]">
                  {p.isGoalkeeper ? tPos("GK") : tPos("OUT")}
                </td>
                <td className="px-4 py-3">
                  <PlayerMeta p={p} tPot={tPot} />
                </td>
                <td className="px-4 py-3">
                  <RevealProgressBar p={p} t={t} />
                </td>
                <td className="px-4 py-3 text-right">
                  <PromoteButton
                    p={p}
                    canPromote={canPromote}
                    promoting={promoting}
                    onClick={() => onPromote(p)}
                    t={t}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardsView({
  t,
  tPos,
  tPot,
  players,
  isOwnTeam,
  promoting,
  onPromote,
}: {
  t: ReturnType<typeof useTranslations>;
  tPos: ReturnType<typeof useTranslations>;
  tPot: ReturnType<typeof useTranslations>;
  players: YouthPlayer[];
  isOwnTeam: boolean;
  locale?: string;
  promoting: YouthPlayer | null;
  onPromote: (p: YouthPlayer) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {players.map((p) => {
        const canPromote =
          isOwnTeam &&
          p.revealedSkills.length >= getRequiredRevealCount(p) &&
          !p.isPromoted;
        return (
          <article
            key={p.id}
            className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#d3f5e8]">
                  {p.name}
                </h3>
                <p className="text-[11px] text-[#91b2a6] font-space">
                  {p.isGoalkeeper ? tPos("GK") : tPos("OUT")} · {p.nationality ?? "—"}
                </p>
              </div>
              <PlayerMeta p={p} tPot={tPot} />
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-[#91b2a6]">{t("columns.age")}</span>
              <AgeCell p={p} t={t} />
            </div>

            {p.abilities && p.abilities.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {p.abilities.map((a: string) => (
                  <span
                    key={a}
                    className="text-[10px] px-2 py-0.5 rounded bg-[#a1ffc2]/10 text-[#a1ffc2] font-bold"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}

            <RevealProgressBar p={p} t={t} />

            <PromoteButton
              p={p}
              canPromote={canPromote}
              promoting={promoting}
              onClick={() => onPromote(p)}
              t={t}
            />
          </article>
        );
      })}
    </div>
  );
}

function PromoteButton({
  p,
  canPromote,
  promoting,
  onClick,
  t,
}: {
  p: YouthPlayer;
  canPromote: boolean;
  promoting: YouthPlayer | null;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (p.isPromoted) {
    return (
      <span className="text-[10px] text-[#91b2a6] uppercase tracking-wider font-bold">
        ✓
      </span>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={!canPromote || promoting?.id === p.id}
      title={!canPromote ? t("promoteDisabledReason") : ""}
      className={
        canPromote
          ? "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#a1ffc2] text-[#001e17] text-[11px] font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors disabled:opacity-50"
          : "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2f4e44]/30 text-[#91b2a6] text-[11px] font-bold uppercase tracking-wider cursor-not-allowed"
      }
    >
      {promoting?.id === p.id ? (
        <span className="material-symbols-outlined text-[14px] animate-spin">
          progress_activity
        </span>
      ) : (
        <span className="material-symbols-outlined text-[14px]">trending_up</span>
      )}
      {t("promote")}
    </button>
  );
}

function Toast({
  kind,
  text,
  onDismiss,
}: {
  kind: "success" | "error";
  text: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div
      className={
        kind === "success"
          ? "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-[#a1ffc2] text-[#001e17] text-sm font-bold shadow-2xl flex items-center gap-2"
          : "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-error text-white text-sm font-bold shadow-2xl flex items-center gap-2"
      }
    >
      <span className="material-symbols-outlined">
        {kind === "success" ? "check_circle" : "error"}
      </span>
      {text}
    </div>
  );
}