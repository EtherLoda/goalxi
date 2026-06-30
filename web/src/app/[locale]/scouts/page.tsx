"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type ScoutCandidate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Computes the next Saturday 06:00 UTC — that's when the cron job
 * `ScoutSchedulerService.generateScoutCandidates` runs. Surfaced as a
 * "Next auto-report" countdown so the user knows when to check back.
 */
function getNextAutoReport(now: Date = new Date()): Date {
  const next = new Date(now);
  // setDate(0) → last day of previous month; .getDay() on that gives the
  // weekday offset we need. Easier path: walk day-by-day.
  next.setUTCHours(6, 0, 0, 0);
  // If today's 06:00 already passed, advance to next day.
  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  // Now find the next Saturday (day 6).
  while (next.getUTCDay() !== 6) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function formatCountdown(target: Date, now: Date = new Date()): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return "now";
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

const TIER_COLOR: Record<string, string> = {
  LOW: "text-[#91b2a6] bg-[#91b2a6]/10",
  REGULAR: "text-[#a1ffc2] bg-[#a1ffc2]/10",
  HIGH_PRO: "text-[#fbbf24] bg-[#fbbf24]/10",
  ELITE: "text-[#f472b6] bg-[#f472b6]/10",
  LEGEND: "text-[#a78bfa] bg-[#a78bfa]/10",
};

export default function ScoutsPage() {
  const t = useTranslations("youth.scouts");
  const tPos = useTranslations("youth.squad.position");
  const tPot = useTranslations("youth.squad.potentialLabel");
  const tTendency = useTranslations("youth.scouts.abilityTendency");
  const params = useParams();
  const search = useSearchParams();
  const { team } = useAuth();

  const locale = (params.locale as string) || "en";
  const teamIdFromQuery = search.get("team");
  // The scouts endpoint is class-level @UseGuards(AuthGuard) so any
  // authenticated user can read their own team's candidates. If they're
  // viewing another team the controller still returns their own list, but
  // we surface that as a "not your team" message for clarity.
  const isOwnTeam = !teamIdFromQuery || teamIdFromQuery === team?.id;

  const [candidates, setCandidates] = useState<ScoutCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<ScoutCandidate | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.scouts
      .listCandidates()
      .then((data) => {
        if (!cancelled) setCandidates(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "load failed");
          setCandidates([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Tick a "now" clock once a minute so the "next auto-report" countdown
  // and per-card expiry labels stay current.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const visible = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter((c) => !skipped.has(c.id));
  }, [candidates, skipped]);

  const nextReport = useMemo(() => getNextAutoReport(now), [now]);

  const handleSelect = async (c: ScoutCandidate) => {
    setSelecting(null);
    setBusyId(c.id);
    setToast(null);
    try {
      await api.scouts.selectCandidate(c.id);
      setCandidates((prev) => (prev ?? []).filter((x) => x.id !== c.id));
      setToast({
        kind: "success",
        text: `${c.name} → ${t("select")} ✓`,
      });
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "select failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (c: ScoutCandidate) => {
    setBusyId(c.id);
    setToast(null);
    try {
      await api.scouts.skipCandidate(c.id);
      setSkipped((prev) => new Set(prev).add(c.id));
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "skip failed",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="px-8 py-6 space-y-6">
      <Header
        title={t("title")}
        nextReport={nextReport}
        now={now}
      />

      {!isOwnTeam && (
        <div className="bg-[#fbbf24]/10 border border-[#fbbf24]/30 rounded-xl p-4 text-sm text-[#fbbf24] font-space">
          Viewing another team — scouts inbox is only available for your own
          team.
        </div>
      )}

      {error && (
        <div className="bg-error/10 border border-error/30 rounded-xl p-6 text-error text-sm">
          {error}
        </div>
      )}

      {candidates && visible.length === 0 && !error && isOwnTeam && (
        <EmptyState text={t("empty")} nextReport={nextReport} now={now} />
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((c) => (
            <CandidateCard
              key={c.id}
              c={c}
              tPos={tPos}
              tPot={tPot}
              tTendency={tTendency}
              t={t}
              now={now}
              busy={busyId === c.id}
              onSelect={() => setSelecting(c)}
              onSkip={() => handleSkip(c)}
            />
          ))}
        </div>
      )}

      {selecting && (
        <ConfirmDialog
          c={selecting}
          t={t}
          onConfirm={() => handleSelect(selecting)}
          onCancel={() => setSelecting(null)}
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
  nextReport,
  now,
}: {
  title: string;
  nextReport: Date;
  now: Date;
}) {
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-black font-space text-[#d3f5e8] tracking-tight">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-2 text-xs text-[#91b2a6] font-space">
        <span className="material-symbols-outlined text-base">schedule</span>
        <span>
          Next auto-report:{" "}
          <span className="text-[#d3f5e8] font-bold">
            {formatCountdown(nextReport, now)}
          </span>
        </span>
      </div>
    </header>
  );
}

function EmptyState({
  text,
  nextReport,
  now,
}: {
  text: string;
  nextReport: Date;
  now: Date;
}) {
  return (
    <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 px-6 py-16 text-center">
      <span className="material-symbols-outlined text-[#91b2a6] text-5xl">
        travel_explore
      </span>
      <p className="mt-4 text-sm text-[#91b2a6] font-space max-w-md mx-auto">
        {text}
      </p>
      <p className="mt-2 text-xs text-[#91b2a6] font-space">
        Next report in{" "}
        <span className="text-[#d3f5e8] font-bold">
          {formatCountdown(nextReport, now)}
        </span>
      </p>
    </div>
  );
}

function CandidateCard({
  c,
  tPos,
  tPot,
  tTendency,
  t,
  now,
  busy,
  onSelect,
  onSkip,
}: {
  c: ScoutCandidate;
  tPos: ReturnType<typeof useTranslations>;
  tPot: ReturnType<typeof useTranslations>;
  tTendency: ReturnType<typeof useTranslations>;
  t: ReturnType<typeof useTranslations>;
  now: Date;
  busy: boolean;
  onSelect: () => void;
  onSkip: () => void;
}) {
  const tier = c.potentialTier;
  const tierClass = tier
    ? TIER_COLOR[tier] ?? TIER_COLOR.LOW
    : "bg-[#2f4e44]/40 text-[#91b2a6]";

  const hoursLeft = Math.max(
    0,
    Math.floor((new Date(c.expiresAt).getTime() - now.getTime()) / 3_600_000),
  );

  return (
    <article className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-[#d3f5e8] truncate">
            {c.name}
          </h3>
          <p className="text-[11px] text-[#91b2a6] font-space">
            {c.age} · {c.nationality} ·{" "}
            {c.isGoalkeeper ? tPos("GK") : tPos("OUT")}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tierClass}`}
        >
          {c.potentialRevealed && tier ? tPot(tier) : "?"}
        </span>
      </div>

      {/* Tendency hint — top-of-mind summary line */}
      {c.tendencyHint && (
        <p className="text-xs text-[#a1ffc2] font-bold">
          ✨ {c.tendencyHint}
        </p>
      )}

      {/* Revealed skills mini grid */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#91b2a6] mb-1.5 font-bold">
          Revealed skills ({c.revealedSkills.length})
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {c.revealedSkills.map((s) => (
            <div
              key={s.key}
              className="flex items-center justify-between bg-[#001e17] rounded px-2 py-1.5"
            >
              <span className="text-[10px] font-bold text-[#d3f5e8] uppercase">
                {s.key}
              </span>
              <span className="text-[10px] text-[#91b2a6] tabular-nums">
                {Math.floor(s.current)}
                <span className="text-[#2f4e44]"> / </span>
                <span className="text-[#a1ffc2]">{Math.floor(s.potential)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Expiry + actions */}
      <div className="flex items-center justify-between pt-2 border-t border-white/5">
        <span className="text-[10px] text-[#91b2a6] flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px]">
            hourglass_empty
          </span>
          {hoursLeft > 0
            ? t("expiresIn", { hours: hoursLeft })
            : "expired"}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onSkip}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider text-[#91b2a6] hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {t("skip")}
          </button>
          <button
            onClick={onSelect}
            disabled={busy}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#a1ffc2] text-[#001e17] text-[11px] font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors disabled:opacity-50"
          >
            {busy ? (
              <span className="material-symbols-outlined text-[14px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">add</span>
            )}
            {t("select")}
          </button>
        </div>
      </div>
    </article>
  );
}

function ConfirmDialog({
  c,
  t,
  onConfirm,
  onCancel,
}: {
  c: ScoutCandidate;
  t: ReturnType<typeof useTranslations>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-gradient-to-b from-[#0a1a14] to-[#001e17] rounded-2xl border border-[#2f4e44]/50 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#a1ffc2]/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-[#a1ffc2]">
              person_add
            </span>
          </div>
          <div>
            <h3 className="text-lg font-black font-space text-[#d3f5e8]">
              {t("selectConfirmTitle", { name: c.name })}
            </h3>
          </div>
        </div>

        <p className="text-sm text-[#91b2a6] font-space mb-6">
          {t("selectConfirmBody", { weeks: 10 })}
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-[#91b2a6] hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-lg bg-[#a1ffc2] text-[#001e17] text-sm font-bold hover:bg-[#b9ffce] transition-colors"
          >
            {t("select")}
          </button>
        </div>
      </div>
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
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
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