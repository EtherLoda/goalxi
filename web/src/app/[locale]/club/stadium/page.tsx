"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type RecentHomeMatch,
  type StadiumConstruction,
  type StadiumSummary,
} from "@/lib/api";
import { useCurrentTeamId } from "@/stores/gameStore";
import { ConstructionDialog } from "@/components/club/ConstructionDialog";

type Locale = "en" | "zh";

/** 把 0-1 的上座率渲染成球场座位 — 用「按行 hash 决定是否点亮」的方式,
 *  不需要后端返回真实座位图,只在客户端渲染纯装饰。
 */
function StadiumPitch({
  fillRate,
  capacity,
}: {
  fillRate: number;
  capacity: number;
}) {
  // 用容量决定「总席位数」,但视觉只画 4800 个点(60行 × 80列),足够细腻
  const ROWS = 40;
  const COLS = 80;
  const totalDots = ROWS * COLS;
  const filled = Math.round(totalDots * Math.max(0, Math.min(1, fillRate)));
  // 用容量给点数加一个「呼吸」效果 — 越大场地看起来越空旷
  const sizeTone =
    capacity > 50_000 ? "rare" : capacity > 20_000 ? "normal" : "cozy";

  return (
    <div className="relative w-full aspect-[2.4/1] rounded-[2rem] overflow-hidden bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-low border border-outline-variant/15">
      {/* 球场草地 */}
      <div className="absolute inset-[14%] rounded-[1.2rem] bg-gradient-to-br from-emerald-900/40 via-emerald-800/30 to-emerald-900/40 border border-emerald-700/30">
        <div className="absolute inset-0 opacity-30">
          {/* 草皮条纹 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 h-[12.5%] border-t border-emerald-700/20"
              style={{ top: `${i * 12.5}%` }}
            />
          ))}
          {/* 中圈 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-emerald-300/30" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-300/40" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-300/20" />
        </div>
      </div>

      {/* 四面看台座位点 — 围绕草地的环 */}
      <svg
        viewBox={`0 0 ${COLS * 6} ${ROWS * 6}`}
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        {Array.from({ length: totalDots }).map((_, i) => {
          const row = Math.floor(i / COLS);
          const col = i % COLS;
          const x = col * 6 + 3;
          const y = row * 6 + 3;
          // 排除在场地内的点
          const insidePitchX = col > 12 && col < COLS - 13;
          const insidePitchY = row > 5 && row < ROWS - 6;
          if (insidePitchX && insidePitchY) return null;
          const isFilled = i < filled;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width="4"
              height="4"
              rx="0.5"
              className={
                isFilled
                  ? sizeTone === "cozy"
                    ? "fill-amber-300/80"
                    : sizeTone === "normal"
                      ? "fill-amber-300/70"
                      : "fill-amber-300/55"
                  : "fill-on-surface-variant/15"
              }
            />
          );
        })}
      </svg>

      {/* 角落强光,强化氛围 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        <div className="absolute bottom-0 left-1/4 w-1/2 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      </div>
    </div>
  );
}

export default function StadiumPage() {
  const t = useTranslations("club.stadiumPage");
  const tCommon = useTranslations();
  const tStadium = useTranslations("club.stadium");
  const tConstruction = useTranslations("club.stadiumPage.construction");
  const tDialog = useTranslations("club.stadiumPage.constructionDialog");
  const params = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const currentTeamId = useCurrentTeamId();
  const locale = (params.locale as Locale) || "en";

  const [summary, setSummary] = useState<StadiumSummary | null>(null);
  const [recent, setRecent] = useState<RecentHomeMatch[]>([]);
  const [constructions, setConstructions] = useState<StadiumConstruction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [dialogKind, setDialogKind] = useState<"expand" | "demolish" | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    if (!currentTeamId) return;
    const [s, r, c] = await Promise.all([
      api.stadium.getSummary(currentTeamId).catch(() => null),
      api.stadium.getRecentHomeMatches(currentTeamId, 6).catch(() => []),
      api.stadium.listConstructions(currentTeamId).catch(() => []),
    ]);
    setSummary(s);
    setRecent(r);
    setConstructions(c);
  };

  useEffect(() => {
    if (!currentTeamId) return;
    setIsLoading(true);
    setError(null);
    refresh()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : tCommon("common.error"));
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeamId, tCommon]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4_000);
    return () => clearTimeout(id);
  }, [toast]);

  const fillRate = summary?.lastHomeFillRate ?? 0;
  const avgAttendance = summary?.currentSeasonAvgAttendance;
  const occupancyText = useMemo(() => {
    if (fillRate === 0) return "—";
    return `${Math.round(fillRate * 100)}%`;
  }, [fillRate]);

  const activeConstructions = constructions.filter(
    (c) => c.status === "IN_PROGRESS",
  );
  const completedConstructions = constructions.filter(
    (c) => c.status === "COMPLETED",
  );
  const blockedByActive = activeConstructions.length > 0;

  const handleDialogSuccess = async (info: {
    delta: number;
    weeks: number;
    cost: number;
  }) => {
    const wasKind = dialogKind;
    setDialogKind(null);
    setToast(
      wasKind === "demolish"
        ? tConstruction("queuedDemolishToast", {
            delta: info.delta.toLocaleString(),
            weeks: tConstruction("weeksValue", { n: info.weeks }),
          })
        : tConstruction("queuedExpandToast", {
            delta: info.delta.toLocaleString(),
            weeks: tConstruction("weeksValue", { n: info.weeks }),
          }),
    );
    await refresh();
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant animate-pulse">
          {tCommon("common.loading")}
        </div>
      </div>
    );
  }
  if (!user || !currentTeamId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="font-headline text-sm font-bold uppercase tracking-widest text-error">
          {tCommon("auth.loginRequired")}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mb-3">
          <span className="material-symbols-outlined text-base">stadium</span>
          <span>{tCommon("dashboard.nav.operations")}</span>
        </div>
        <h1 className="font-headline text-4xl font-black uppercase tracking-tight text-on-surface">
          {t("title")}
        </h1>
        <p className="font-body text-sm text-on-surface-variant mt-2 max-w-2xl">
          {t("subtitle")}
        </p>
      </header>

      {error && (
        <div className="px-4 py-3 rounded-lg border border-error/30 bg-error/10 text-error text-sm">
          {error}
        </div>
      )}

      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-lg bg-surface-container-highest border border-primary/30 text-on-surface font-body text-sm shadow-lg">
          {toast}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-72 rounded-2xl bg-surface-container/30 animate-pulse" />
          <div className="h-40 rounded-xl bg-surface-container/30 animate-pulse" />
        </div>
      ) : !summary ? (
        <NoStadiumEmpty />
      ) : (
        <>
          {/* Hero — visual pitch + occupancy gauge */}
          <section className="relative overflow-hidden rounded-3xl border border-outline-variant/10 bg-gradient-to-br from-surface-container-low via-surface-container to-surface-container-low">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-0">
              {/* Stadium visual */}
              <div className="p-6 lg:p-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-1">
                      {tStadium("title")}
                    </div>
                    <h2 className="font-headline text-2xl md:text-3xl font-black text-on-surface">
                      {summary.name}
                    </h2>
                  </div>
                </div>
                <StadiumPitch fillRate={fillRate} capacity={summary.capacity} />
              </div>

              {/* Occupancy gauge */}
              <div className="relative p-6 lg:p-8 lg:border-l border-t lg:border-t-0 border-outline-variant/10 bg-gradient-to-br from-primary/5 via-transparent to-transparent">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-2">
                  {t("lastMatchAttendance")}
                </div>
                <div className="flex items-end gap-3">
                  <div className="font-headline text-7xl font-black text-on-surface leading-none">
                    {occupancyText}
                  </div>
                  <div className="pb-2 text-xs text-on-surface-variant">
                    {t("fillRateHint")}
                  </div>
                </div>

                {/* Bar */}
                <div className="mt-5 h-2 rounded-full bg-surface-container overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary via-primary to-amber-300 transition-[width] duration-700"
                    style={{ width: `${Math.round(fillRate * 100)}%` }}
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 mt-6">
                  <MiniStat
                    label={tStadium("capacity")}
                    value={summary.capacity.toLocaleString()}
                    icon="event_seat"
                  />
                  <MiniStat
                    label={tStadium("avgAttendance")}
                    value={
                      avgAttendance != null
                        ? avgAttendance.toLocaleString()
                        : "—"
                    }
                    icon="groups"
                  />
                  <MiniStat
                    label={tStadium("estRevenue")}
                    value={summary.estMatchdayRevenue.toLocaleString()}
                    icon="payments"
                    tone="primary"
                  />
                  <MiniStat
                    label={t("seasonAttendance")}
                    value={
                      avgAttendance != null && summary.capacity > 0
                        ? `${Math.round((avgAttendance / summary.capacity) * 100)}%`
                        : "—"
                    }
                    icon="percent"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Construction — dialog-driven queue */}
          <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
            <header className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-1">
                  <span className="material-symbols-outlined text-base">
                    construction
                  </span>
                  <span>{tConstruction("eyebrow")}</span>
                </div>
                <h3 className="font-headline text-xl font-black text-on-surface">
                  {tConstruction("title")}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1 max-w-xl">
                  {tConstruction("subtitle")}
                </p>
              </div>
            </header>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDialogKind("expand")}
                disabled={blockedByActive}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm leading-none">
                  add
                </span>
                {tConstruction("expandCta")}
              </button>

              <button
                type="button"
                onClick={() => setDialogKind("demolish")}
                disabled={blockedByActive}
                className="inline-flex items-center gap-1.5 rounded-full border border-error/30 bg-error/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-error hover:bg-error/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-sm leading-none">
                  remove
                </span>
                {tConstruction("demolishCta")}
              </button>
            </div>

            {blockedByActive && (
              <p className="mt-4 text-xs text-on-surface-variant">
                {tDialog("oneAtATime")}
              </p>
            )}
          </section>

          {/* Active constructions */}
          {activeConstructions.length > 0 && (
            <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 space-y-3">
              <header className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-base text-primary">
                  schedule
                </span>
                <h3 className="font-headline text-base font-bold text-on-surface">
                  {tConstruction("activeProjects")}
                </h3>
              </header>
              {activeConstructions.map((c) => (
                <ActiveConstructionCard
                  key={c.id}
                  construction={c}
                  locale={locale}
                  labels={{
                    weeksLeft: tConstruction("weeksLeft", { n: c.remainingWeeks }),
                    eta: tConstruction("eta", {
                      season: c.seasonStarted,
                      week: c.weekStarted + c.totalWeeks,
                    }),
                  }}
                />
              ))}
            </section>
          )}

          {/* Recent matches */}
          <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-1">
                  <span className="material-symbols-outlined text-base">
                    history
                  </span>
                  <span>{t("recentMatches.eyebrow")}</span>
                </div>
                <h3 className="font-headline text-xl font-black text-on-surface">
                  {t("recentMatches.title")}
                </h3>
              </div>
              <Link
                href={`/${locale}/matches`}
                className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
              >
                {t("recentMatches.viewAll")}
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
                  sports_soccer
                </span>
                <p className="font-body text-sm text-on-surface-variant mt-2">
                  {t("recentMatches.empty")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {recent.map((m) => (
                  <RecentMatchCard
                    key={m.id}
                    match={m}
                    locale={locale}
                    labels={{
                      attendance: t("recentMatches.attendance"),
                      fillRate: t("recentMatches.fillRate"),
                      vs: t("recentMatches.vs"),
                    }}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Recently completed constructions */}
          {completedConstructions.length > 0 && (
            <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 space-y-2">
              <header className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-base text-on-surface-variant">
                  check_circle
                </span>
                <h3 className="font-headline text-sm font-bold uppercase tracking-widest text-on-surface-variant">
                  {tConstruction("recentProjects")}
                </h3>
              </header>
              {completedConstructions.slice(0, 3).map((c) => (
                <CompletedConstructionRow key={c.id} construction={c} />
              ))}
            </section>
          )}
        </>
      )}

      {dialogKind && summary && (
        <ConstructionDialog
          kind={dialogKind}
          teamId={currentTeamId}
          currentCapacity={summary.capacity}
          costPerSeat={summary.seatAdjustCost}
          currentEstMatchdayRevenue={summary.estMatchdayRevenue}
          onCancel={() => setDialogKind(null)}
          onSuccess={handleDialogSuccess}
        />
      )}
    </div>
  );
}

function ActiveConstructionCard({
  construction,
  labels,
}: {
  construction: StadiumConstruction;
  locale: Locale;
  labels: { weeksLeft: string; eta: string };
}) {
  const isExpand = construction.kind === "EXPAND";
  const progressPct = Math.min(
    100,
    Math.max(
      0,
      ((construction.totalWeeks - construction.remainingWeeks) /
        construction.totalWeeks) *
        100,
    ),
  );
  const sign = isExpand ? "+" : "−";
  return (
    <div className="rounded-xl border border-outline-variant/15 bg-surface-container/40 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div
            className={
              "text-[10px] font-black uppercase tracking-widest mb-0.5 " +
              (isExpand ? "text-primary" : "text-error")
            }
          >
            {isExpand ? "Expand" : "Demolish"}
          </div>
          <div className="font-headline text-xl font-black text-on-surface tabular-nums">
            {sign}
            {construction.deltaSeats.toLocaleString()}{" "}
            <span className="text-xs text-on-surface-variant font-body font-normal">
              seats
            </span>
          </div>
          <div className="text-[10px] text-on-surface-variant mt-1">
            {construction.startingCapacity.toLocaleString()} →{" "}
            {construction.endingCapacity.toLocaleString()}
          </div>
        </div>
        <div className="text-right">
          <div className="font-headline text-sm font-bold text-on-surface">
            {labels.weeksLeft}
          </div>
          <div className="text-[10px] text-on-surface-variant mt-0.5">
            {labels.eta}
          </div>
        </div>
      </div>
      <div className="h-2 rounded-full bg-surface-container overflow-hidden">
        <div
          className={
            "h-full transition-[width] duration-700 " +
            (isExpand
              ? "bg-gradient-to-r from-primary via-primary to-amber-300"
              : "bg-gradient-to-r from-error via-error to-amber-300")
          }
          style={{ width: `${Math.round(progressPct)}%` }}
        />
      </div>
    </div>
  );
}

function CompletedConstructionRow({
  construction,
}: {
  construction: StadiumConstruction;
}) {
  const isExpand = construction.kind === "EXPAND";
  const sign = isExpand ? "+" : "−";
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-surface-container/40 border border-outline-variant/10 text-xs">
      <div className="flex items-center gap-2">
        <span
          className={
            "material-symbols-outlined text-base " +
            (isExpand ? "text-primary" : "text-error")
          }
        >
          {isExpand ? "trending_up" : "trending_down"}
        </span>
        <span className="font-headline text-on-surface tabular-nums">
          {sign}
          {construction.deltaSeats.toLocaleString()}
        </span>
        <span className="text-on-surface-variant">
          → {construction.endingCapacity.toLocaleString()}
        </span>
      </div>
      <span className="text-[10px] text-on-surface-variant">
        {construction.completedAt
          ? new Date(construction.completedAt).toLocaleDateString()
          : "—"}
      </span>
    </div>
  );
}

function NoStadiumEmpty() {
  const t = useTranslations("club.stadium");
  return (
    <div className="bg-surface-container-low rounded-2xl p-12 border border-outline-variant/10 text-center">
      <span className="material-symbols-outlined text-6xl text-on-surface-variant/40">
        stadium
      </span>
      <p className="font-headline text-base font-bold text-on-surface mt-4">
        {t("none")}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: string;
  tone?: "primary";
}) {
  return (
    <div className="bg-surface-container/70 rounded-lg p-3 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-1">
        <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span
          className={
            "material-symbols-outlined text-base " +
            (tone === "primary" ? "text-primary" : "text-on-surface-variant")
          }
        >
          {icon}
        </span>
      </div>
      <div className="font-headline text-lg font-black text-on-surface">
        {value}
      </div>
    </div>
  );
}

function RecentMatchCard({
  match,
  locale,
  labels,
}: {
  match: RecentHomeMatch;
  locale: Locale;
  labels: { attendance: string; fillRate: string; vs: string };
}) {
  const date = new Date(match.scheduledAt);
  const dateText = date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });
  const fillPct =
    match.fillRate != null ? `${Math.round(match.fillRate * 100)}%` : "—";

  const resultColor =
    match.result === "W"
      ? "bg-primary/20 text-primary border-primary/40"
      : match.result === "L"
        ? "bg-error/15 text-error border-error/40"
        : match.result === "D"
          ? "bg-amber-400/15 text-amber-300 border-amber-400/40"
          : "bg-on-surface-variant/15 text-on-surface-variant border-outline-variant/30";

  return (
    <Link
      href={`/${locale}/matches/${match.id}`}
      className="group relative overflow-hidden rounded-xl border border-outline-variant/10 bg-surface-container/40 hover:bg-surface-container transition-colors p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] text-on-surface-variant">
          {dateText}
        </span>
        <span
          className={
            "px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider " +
            resultColor
          }
        >
          {match.result ?? "—"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="font-headline text-sm font-bold text-on-surface truncate">
          {match.opponentName}
        </div>
        <div className="font-headline text-base font-black text-on-surface tabular-nums">
          {match.homeScore ?? "-"} : {match.awayScore ?? "-"}
        </div>
      </div>

      {/* Attendance mini-bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-amber-300"
            style={{
              width:
                match.fillRate != null
                  ? `${Math.round(match.fillRate * 100)}%`
                  : "0%",
            }}
          />
        </div>
        <span className="font-mono text-[10px] text-on-surface-variant tabular-nums">
          {fillPct}
        </span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-on-surface-variant">
        <span>
          <span className="material-symbols-outlined text-[12px] align-middle mr-0.5">
            groups
          </span>
          {match.attendance?.toLocaleString() ?? "—"}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary">
          {labels.vs} →
        </span>
      </div>
    </Link>
  );
}