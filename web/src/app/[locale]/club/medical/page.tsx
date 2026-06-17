"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type InjuryHistoryEntry,
  type PlayerInjuryStatus,
  type TeamDoctor,
} from "@/lib/api";
import { useCurrentTeamId } from "@/stores/gameStore";
import { formatRecoveryWeeks } from "@/lib/format-recovery-weeks";

const INJURY_TYPE_ICONS: Record<string, string> = {
  muscle: "fitness_center",
  ligament: "healing",
  joint: "accessibility",
  head: "psychology",
  other: "medical_services",
};

export default function MedicalPage() {
  const t = useTranslations("medical");
  const tCommon = useTranslations();
  const params = useParams();
  const { user, isLoading: authLoading } = useAuth();
  const currentTeamId = useCurrentTeamId();
  const locale = (params.locale as "en" | "zh") || "en";

  const [injured, setInjured] = useState<PlayerInjuryStatus[]>([]);
  const [history, setHistory] = useState<InjuryHistoryEntry[]>([]);
  const [doctor, setDoctor] = useState<TeamDoctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTeamId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      api.injuries.getTeamInjured(currentTeamId),
      api.injuries.getTeamHistory(currentTeamId, { limit: 20, days: 60 }),
      api.staff.getDoctor(currentTeamId).catch(() => null),
    ])
      .then(([injuredData, historyData, doctorData]) => {
        setInjured(injuredData);
        setHistory(historyData);
        setDoctor(doctorData);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : tCommon("common.error"));
      })
      .finally(() => setIsLoading(false));
  }, [currentTeamId, tCommon]);

  const summary = useMemo(() => {
    const total = injured.length;
    const minorCount = injured.filter(
      (i) => i.injuryState === "minor",
    ).length;
    const severeCount = total - minorCount;
    const weeks = injured
      .map((i) => formatRecoveryWeeks(i.estimatedRecoveryDays ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    const avgWeeks =
      weeks.length === 0
        ? 0
        : Math.round(weeks.reduce((a, b) => a + b, 0) / weeks.length);
    return { total, minorCount, severeCount, avgWeeks };
  }, [injured]);

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
    <div className="px-6 py-8 lg:px-10 lg:py-10 max-w-7xl mx-auto">
      {/* Header */}
      <header className="mb-10">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-primary/70 mb-3">
          <span className="material-symbols-outlined text-base">medical_services</span>
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
        <div className="mb-6 px-4 py-3 rounded-lg border border-error/30 bg-error/10 text-error text-sm">
          {error}
        </div>
      )}

      {/* Summary cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label={t("summary.total")}
          value={summary.total}
          tone="primary"
          icon="local_hospital"
        />
        <SummaryCard
          label={t("summary.severe")}
          value={summary.severeCount}
          tone="error"
          icon="emergency"
        />
        <SummaryCard
          label={t("summary.minor")}
          value={summary.minorCount}
          tone="amber"
          icon="healing"
        />
        <SummaryCard
          label={t("summary.avgRecovery")}
          value={t("summary.weeksShort", { n: summary.avgWeeks })}
          tone="muted"
          icon="schedule"
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Doctor card */}
        <section className="bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
          <h2 className="font-headline text-lg font-bold text-on-surface uppercase tracking-tight mb-4">
            {t("doctor.title")}
          </h2>
          {doctor ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center font-headline text-lg font-black text-primary">
                  {doctor.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-headline text-sm font-bold text-on-surface truncate">
                    {doctor.name}
                  </div>
                  <div className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                    {t("doctor.level", { level: doctor.level })}
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-outline-variant/10 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-on-surface-variant">
                    {t("doctor.recoveryBonus")}
                  </span>
                  <span className="font-headline font-bold text-primary">
                    +{Math.round((doctor.recoveryBonus - 1) * 100)}%
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-on-surface-variant">
                    {t("doctor.contractExpiry")}
                  </span>
                  <span className="font-headline font-bold text-on-surface">
                    {new Date(doctor.contractExpiry).toLocaleDateString(locale)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant/40">
                medical_information
              </span>
              <p className="font-body text-sm text-on-surface-variant mt-3">
                {t("doctor.none")}
              </p>
            </div>
          )}
        </section>

        {/* Active injuries */}
        <section className="lg:col-span-2 bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold text-on-surface uppercase tracking-tight">
              {t("active.title")}
            </h2>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              {t("active.count", { n: injured.length })}
            </span>
          </div>
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : injured.length === 0 ? (
            <EmptyState message={t("active.empty")} icon="verified" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant/10">
              <table className="w-full">
                <thead className="bg-surface-container/50">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    <th className="text-left px-3 py-2">{t("active.player")}</th>
                    <th className="text-left px-3 py-2">{t("active.injury")}</th>
                    <th className="text-left px-3 py-2">{t("active.state")}</th>
                    <th className="text-right px-3 py-2">
                      {t("active.recovery")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {injured.map((p) => {
                    const weeks = formatRecoveryWeeks(
                      p.estimatedRecoveryDays ?? 0,
                    );
                    const isMinor = p.injuryState === "minor";
                    return (
                      <tr
                        key={p.playerId}
                        className="border-t border-outline-variant/10 hover:bg-surface-container/30 transition-colors"
                      >
                        <td className="px-3 py-2.5 font-headline text-sm font-bold text-on-surface">
                          {p.playerName}
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-base text-on-surface-variant">
                              {INJURY_TYPE_ICONS[p.injuryType ?? "other"] ??
                                "medical_services"}
                            </span>
                            <span className="text-on-surface">
                              {p.injuryType
                                ? t(`injuryTypes.${p.injuryType}`)
                                : "—"}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={[
                              "inline-block px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider",
                              isMinor
                                ? "bg-amber-400/15 text-amber-300 border-amber-400/30"
                                : "bg-error/15 text-error border-error/30",
                            ].join(" ")}
                          >
                            {t(
                              isMinor ? "active.minorTag" : "active.severeTag",
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-headline text-sm font-bold text-on-surface">
                          {t("active.eta", { n: weeks })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent history */}
        <section className="lg:col-span-3 bg-surface-container-low rounded-xl p-6 border border-outline-variant/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-headline text-lg font-bold text-on-surface uppercase tracking-tight">
              {t("history.title")}
            </h2>
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
              {t("history.window")}
            </span>
          </div>
          {isLoading ? (
            <SkeletonRows rows={3} />
          ) : history.length === 0 ? (
            <EmptyState message={t("history.empty")} icon="history" />
          ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant/10">
              <table className="w-full">
                <thead className="bg-surface-container/50">
                  <tr className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    <th className="text-left px-3 py-2">{t("history.date")}</th>
                    <th className="text-left px-3 py-2">{t("history.type")}</th>
                    <th className="text-left px-3 py-2">
                      {t("history.opponent")}
                    </th>
                    <th className="text-left px-3 py-2">
                      {t("history.status")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr
                      key={h.id}
                      className="border-t border-outline-variant/10"
                    >
                      <td className="px-3 py-2.5 text-xs text-on-surface-variant font-mono">
                        {new Date(h.occurredAt).toLocaleDateString(locale)}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base text-on-surface-variant">
                            {INJURY_TYPE_ICONS[h.injuryType] ??
                              "medical_services"}
                          </span>
                          <span className="text-on-surface">
                            {t(`injuryTypes.${h.injuryType}`)}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-on-surface">
                        {h.opponentName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span
                          className={[
                            "px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wider",
                            h.isRecovered
                              ? "bg-primary/15 text-primary border-primary/30"
                              : "bg-error/15 text-error border-error/30",
                          ].join(" ")}
                        >
                          {t(
                            h.isRecovered
                              ? "history.recovered"
                              : "history.active",
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number | string;
  tone: "primary" | "error" | "amber" | "muted";
  icon: string;
}

function SummaryCard({ label, value, tone, icon }: SummaryCardProps) {
  const toneClasses = {
    primary: "text-primary",
    error: "text-error",
    amber: "text-amber-300",
    muted: "text-on-surface",
  }[tone];

  return (
    <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-2">
        <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <span
          className={`material-symbols-outlined text-lg ${toneClasses}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div className={`font-headline text-3xl font-black ${toneClasses}`}>
        {value}
      </div>
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-10 rounded bg-surface-container/30 animate-pulse"
        />
      ))}
    </div>
  );
}

function EmptyState({ message, icon }: { message: string; icon: string }) {
  return (
    <div className="text-center py-8">
      <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">
        {icon}
      </span>
      <p className="font-body text-sm text-on-surface-variant mt-2">{message}</p>
    </div>
  );
}
