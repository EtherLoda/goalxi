"use client";

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
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
import { StadiumStage } from "@/components/club/StadiumStage";
import { RenameStadiumDialog } from "@/components/club/RenameStadiumDialog";

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
      <div className="absolute inset-[14%] rounded-2xl bg-gradient-to-br from-pitch-deep/40 via-pitch-mid/30 to-pitch-deep/40 border border-pitch-line/30">
        <div className="absolute inset-0 opacity-30">
          {/* 草皮条纹 */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 h-[12.5%] border-t border-pitch-line/20"
              style={{ top: `${i * 12.5}%` }}
            />
          ))}
          {/* 中圈 */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-pitch-mark/30" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-pitch-mark/40" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-pitch-mark/20" />
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
  // The rename dialog is independent of the
  // expand/demolish dialog (different API endpoint,
  // different schema) so it lives in its own state
  // slot rather than overloading `dialogKind` with a
  // "rename" value that would be a type-lie.
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
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

  const lastHomeMatch = recent[0] ?? null;
  const weatherKey = (lastHomeMatch?.weather ?? "cloudy").toLowerCase();
  const weatherIcon: MaterialIconName = WEATHER_ICON[weatherKey] ?? "cloud";

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
            weeks: tConstruction("weeksTotal", { n: info.weeks }),
          })
        : tConstruction("queuedExpandToast", {
            delta: info.delta.toLocaleString(),
            weeks: tConstruction("weeksTotal", { n: info.weeks }),
          }),
    );
    await refresh();
  };

  /**
   * Queue the level upgrade. Kept off the construction dialog because an
   * upgrade has no seat delta to pick — there is exactly one thing to do,
   * so a dialog would be a form with a single button in it.
   */
  const queueUpgrade = async () => {
    if (!currentTeamId || isUpgrading) return;
    if (!summary || summary.level >= summary.maxLevel) return;
    setIsUpgrading(true);
    setError(null);
    try {
      const info = await api.stadium.upgradeStadium(currentTeamId);
      setToast(
        tConstruction("queuedUpgradeToast", {
          level: summary.level + 1,
          weeks: tConstruction("weeksTotal", { n: info.weeks }),
        }),
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpgrading(false);
    }
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
          <AppIcon name="stadium" className="text-base" />
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
          {/* Hero — the ground on the left, the money on the right */}
          <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-stretch">
            <StadiumStage
              level={summary.level}
              occupancyText={occupancyText}
              labels={{
                level: t("levelBadge", {
                  level: summary.level,
                  max: summary.maxLevel,
                }),
                occupancy: t("lastMatchAttendance"),
                hint: t("fillRateHint"),
                cap: t("capacityCapHint", {
                  cap: summary.capacityCap.toLocaleString(),
                }),
                rename: t("renameCta"),
              }}
              onRename={() => setIsRenameOpen(true)}
            >
              <StadiumPitch fillRate={fillRate} capacity={summary.capacity} />
            </StadiumStage>

            <aside className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <MiniStat
                  label={tStadium("capacity")}
                  value={summary.capacity.toLocaleString()}
                  hint={t("capacityCapHint", {
                    cap: summary.capacityCap.toLocaleString(),
                  })}
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
                  label={t("maxRevenueLabel")}
                  value={summary.maxMatchdayRevenue.toLocaleString()}
                  icon="trending_up"
                />

                <div className="relative flex flex-1 flex-col justify-between overflow-hidden rounded-xl border border-outline-variant/10 bg-gradient-to-br from-surface-container/80 to-surface-container-low/40 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant">
                      {t("weatherTitle")}
                    </div>
                    <span className="font-mono text-[10px] tabular-nums text-on-surface-variant/70">
                      {lastHomeMatch?.scheduledAt
                        ? new Date(lastHomeMatch.scheduledAt).toLocaleDateString(
                            locale === "zh" ? "zh-CN" : "en-GB",
                            { month: "2-digit", day: "2-digit" },
                          )
                        : ""}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-xl border border-primary/20 bg-primary/10">
                      <AppIcon name={weatherIcon} className="text-2xl text-primary" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-headline text-xl font-black text-on-surface">
                        {t(`weather.${weatherKey}`)}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-on-surface-variant">
                        {t("weatherAttendance", {
                          n: (lastHomeMatch?.attendance ?? 0).toLocaleString(),
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-outline-variant/10 pt-3">
                    <span className="truncate text-[11px] text-on-surface-variant">
                      {lastHomeMatch?.opponentName ?? t("weatherNoMatch")}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-on-surface-variant">
                      {lastHomeMatch?.fillRate != null
                        ? `${Math.round(lastHomeMatch.fillRate * 100)}%`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </aside>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
{/* Construction — dialog-driven queue */}
          <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 flex h-full flex-col">
            <header className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-1">
                  <AppIcon name="construction" className="text-base" />
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

            <div className="flex flex-wrap items-center gap-2">
              
              <button
                type="button"
                onClick={() => void queueUpgrade()}
                disabled={blockedByActive || isUpgrading || summary.level >= summary.maxLevel}
                title={
                  summary.level >= summary.maxLevel
                    ? tConstruction("upgradeMaxed")
                    : tConstruction("upgradeHint", {
                        cost: (summary.upgradeCost ?? 0).toLocaleString(),
                        weeks: tConstruction("weeksTotal", {
                          n: summary.upgradeWeeks ?? 0,
                        }),
                      })
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AppIcon name="north" className="text-sm leading-none" />
                {tConstruction("upgradeCta", { level: summary.level + 1 })}
              </button>

              <button
                type="button"
                onClick={() => setDialogKind("expand")}
                disabled={blockedByActive}
                className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AppIcon name="add" className="text-sm leading-none" />
                {tConstruction("expandCta")}
              </button>

              <button
                type="button"
                onClick={() => setDialogKind("demolish")}
                disabled={blockedByActive}
                className="inline-flex items-center gap-1.5 rounded-full border border-error/30 bg-error/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-error hover:bg-error/15 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <AppIcon name="remove" className="text-sm leading-none" />
                {tConstruction("demolishCta")}
              </button>
            </div>

            {blockedByActive && (
              <p className="mt-4 text-xs text-on-surface-variant">
                {tDialog("oneAtATime")}
              </p>
            )}

            <div className="mt-auto pt-5">
              <div className="mb-2 flex items-center gap-2">
                <AppIcon name="schedule" className="text-sm text-on-surface-variant" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {tConstruction("activeProjects")}
                </h4>
              </div>
              {activeConstructions.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  {tConstruction("emptyProjects")}
                </p>
              ) : (
                <div className="space-y-3">
                  {activeConstructions.map((c) => (
                    <ActiveConstructionCard
                      key={c.id}
                      construction={c}
                      locale={locale}
                      labels={{
                        weeksLeft: tConstruction("weeksLeft"),
                        eta: tConstruction("eta"),
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Recent matches */}
          <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-on-surface-variant mb-1">
                  <AppIcon name="history" className="text-base" />
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
                <AppIcon name="sports_soccer" className="text-3xl text-on-surface-variant/40" />
                <p className="font-body text-sm text-on-surface-variant mt-2">
                  {t("recentMatches.empty")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recent.slice(0, 4).map((m) => (
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

          </div>

          {/* Recently completed constructions */}
          {completedConstructions.length > 0 && (
            <section className="bg-surface-container-low rounded-2xl p-6 border border-outline-variant/10 space-y-2">
              <header className="flex items-center gap-2 mb-2">
                <AppIcon name="check_circle" className="text-base text-on-surface-variant" />
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
          ticketPrice={summary.ticketPrice}
          capacityCap={summary.capacityCap}
          onCancel={() => setDialogKind(null)}
          onSuccess={handleDialogSuccess}
        />
      )}

      {/* Rename dialog — independent of the construction
          dialog (different API endpoint, different
          schema) so it lives in its own render block. */}
      {isRenameOpen && summary && (
        <RenameStadiumDialog
          teamId={currentTeamId}
          currentName={summary.name}
          onCancel={() => setIsRenameOpen(false)}
          onSuccess={(newName) => {
            // Optimistic update: stamp the new name into
            // the local summary so the title re-renders
            // immediately. The full `refresh()` below
            // re-fetches the stadium stats (capacity,
            // attendance, recent matches) so the
            // rest of the page stays consistent with
            // the backend's view of the row.
            setSummary((prev) =>
              prev ? { ...prev, name: newName } : prev,
            );
            setIsRenameOpen(false);
            setToast(tCommon("common.updated"));
            void refresh();
          }}
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
            "h-full transition-[width] duration-deliberate " +
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
        <AppIcon name={isExpand ? "trending_up" : "trending_down"} className={(isExpand ? "text-primary" : "text-error")} />
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
      <AppIcon name="stadium" className="text-6xl text-on-surface-variant/40" />
      <p className="font-headline text-base font-bold text-on-surface mt-4">
        {t("none")}
      </p>
    </div>
  );
}

const WEATHER_ICON: Record<string, MaterialIconName> = {
  sunny: "wb_sunny",
  cloudy: "cloud",
  rainy: "rainy",
  windy: "air",
  foggy: "foggy",
  snowy: "ac_unit",
  stormy: "thunderstorm",
};

function MiniStat({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  label: string;
  value: string;
  icon: MaterialIconName;
  tone?: "primary";
  hint?: string;
}) {
  return (
    <div className="bg-surface-container/70 rounded-lg p-3 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-1">
        <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <AppIcon name={icon} className={(tone === "primary" ? "text-primary" : "text-on-surface-variant")} />
      </div>
      <div className="font-headline text-lg font-black text-on-surface">
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 font-mono text-[10px] tabular-nums text-on-surface-variant">
          {hint}
        </div>
      )}
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
          ? "bg-signal-gold/15 text-amber-300 border-signal-gold/40"
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
          <AppIcon name="groups" className="text-[12px] align-middle mr-0.5" />
          {match.attendance?.toLocaleString() ?? "—"}
        </span>
        <span className="opacity-0 group-hover:opacity-100 transition-opacity text-primary">
          {labels.vs} →
        </span>
      </div>
    </Link>
  );
}