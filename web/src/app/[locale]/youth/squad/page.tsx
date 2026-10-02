"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type Player, type User } from "@/lib/api";

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

function getExpectedKeyCount(p: Player): number {
  return p.isGoalkeeper ? GK_KEYS.length : OUTFIELD_KEYS.length;
}

function getRequiredRevealCount(p: Player): number {
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

function YouthSquadPage() {
  const t = useTranslations("youth.squad");
  const tPos = useTranslations("youth.squad.position");
  const tPot = useTranslations("youth.squad.potentialLabel");
  const params = useParams();

  const locale = (params.locale as string) || "en";

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("table");
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // The youth controller is class-level @UseGuards(AuthGuard) so a logged-in
    // user is sufficient. If we're viewing another team's squad we still
    // hit the endpoint; the backend would currently return 403 — for now we
    // degrade gracefully and show "no players".
    api.players
      .list({ isYouth: true })
      .then((data) => {
        if (cancelled) return;
        // Clear a previous error here rather than with a synchronous
        // `setError(null)` at the top of the effect body: that runs
        // before the first paint of every effect pass and forces an
        // extra render cascade (`react-hooks/set-state-in-effect`).
        // Clearing on success keeps the behaviour that matters — a
        // recovered fetch no longer shows a stale error — without the
        // double render.
        setError(null);
        setPlayers(data.items);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "load failed");
        setPlayers([]);
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
      const pa =
        (a.revealedSkills ?? []).length / Math.max(1, getExpectedKeyCount(a));
      const pb =
        (b.revealedSkills ?? []).length / Math.max(1, getExpectedKeyCount(b));
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

      {sorted.length === 0 && <EmptyState text={t("empty")} />}

      {sorted.length > 0 && view === "table" && (
        <TableView
          t={t}
          tPos={tPos}
          tPot={tPot}
          players={sorted}
          locale={locale}
        />
      )}

      {sorted.length > 0 && view === "cards" && (
        <CardsView
          t={t}
          tPos={tPos}
          tPot={tPot}
          players={sorted}
          locale={locale}
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
  p: Player;
  tPot: ReturnType<typeof useTranslations>;
}) {
  const tier = p.potentialTier;
  const tierClass = tier
    ? (POTENTIAL_TIER_COLOR[tier] ?? POTENTIAL_TIER_COLOR.LOW)
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
  p: Player;
  t: ReturnType<typeof useTranslations>;
}) {
  const total = getExpectedKeyCount(p);
  const cur = (p.revealedSkills ?? []).length;
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
  p: Player;
  t: ReturnType<typeof useTranslations>;
}) {
  // Localised `25y 142d` / `25岁142天` from `common.ageFormat` — single
  // source of truth shared with the senior player profile and the
  // transfer cards so the manager reads identical age strings everywhere.
  return (
    <span className="text-xs text-[#d3f5e8] tabular-nums">
      {t("common.ageFormat", { y: p.age, d: p.ageDays })}
      <span className="text-[10px] text-[#91b2a6] ml-1">({p.revealLevel})</span>
    </span>
  );
}

function TableView({
  t,
  tPos,
  tPot,
  players,
  locale,
}: {
  t: ReturnType<typeof useTranslations>;
  tPos: ReturnType<typeof useTranslations>;
  tPot: ReturnType<typeof useTranslations>;
  players: Player[];
  locale: string;
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
}: {
  t: ReturnType<typeof useTranslations>;
  tPos: ReturnType<typeof useTranslations>;
  tPot: ReturnType<typeof useTranslations>;
  players: Player[];
  locale?: string;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {players.map((p) => {
        return (
          <article
            key={p.id}
            className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-4 flex flex-col gap-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-[#d3f5e8]">{p.name}</h3>
                <p className="text-[11px] text-[#91b2a6] font-space">
                  {p.isGoalkeeper ? tPos("GK") : tPos("OUT")} ·{" "}
                  {p.nationality ?? "—"}
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
          </article>
        );
      })}
    </div>
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

export default function YouthSquadPageWrapper() {
  return (
    <Suspense fallback={null}>
      <YouthSquadPage />
    </Suspense>
  );
}
