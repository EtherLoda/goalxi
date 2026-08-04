"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type ScoutCandidate } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ScoutCard } from "@/components/youth/ScoutCard";

export default function ScoutsPage() {
  // useSearchParams() forces a CSR bailout; Next 16 requires it to
  // live behind a <Suspense> boundary so the static shell can render
  // independently. The fallback matches the page chrome so the swap
  // is invisible.
  return (
    <Suspense
      fallback={
        <div className="px-8 py-6 text-sm text-[#91b2a6] font-space">
          Loading…
        </div>
      }
    >
      <ScoutsPageInner />
    </Suspense>
  );
}

function ScoutsPageInner() {
  const t = useTranslations("youth.scouts");
  const tPos = useTranslations("youth.squad.position");
  const search = useSearchParams();
  const { team } = useAuth();

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
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

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

  const visible = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter((c) => !skipped.has(c.id));
  }, [candidates, skipped]);

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

  // Manually draw a fresh batch of 3 candidates. After the server
  // creates them, refetch the full list so any candidates the
  // server has since dropped (expired, race-condition) drop out of
  // the inbox too — keeps the UI in lockstep with the DB.
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    setToast(null);
    try {
      const fresh = await api.scouts.refreshCandidates();
      if (fresh.length === 0) {
        setToast({ kind: "error", text: t("refreshEmpty") });
        return;
      }
      // Re-sync with the server so expired rows fall off and the
      // new three are included without us having to dedupe by hand.
      const synced = await api.scouts.listCandidates();
      setCandidates(synced);
      setToast({
        kind: "success",
        text: t("refreshSuccess", { count: fresh.length }),
      });
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : t("refreshError"),
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 space-y-6">
      <Header title={t("title")} />

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
        <EmptyState
          text={t("empty")}
          refreshLabel={refreshing ? t("refreshing") : t("refresh")}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {visible.length > 0 && (
        <>
          <div className="flex items-center justify-end">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a1ffc2]/10 border border-[#a1ffc2]/30 text-[#a1ffc2] text-xs font-bold uppercase tracking-wider hover:bg-[#a1ffc2]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? (
                <span className="material-symbols-outlined text-[14px] animate-spin">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-[14px]">
                  refresh
                </span>
              )}
              {refreshing ? t("refreshing") : t("refresh")}
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {visible.map((c, i) => (
              <ScoutCard
                key={c.id}
                c={c}
                tPos={tPos}
                t={t}
                index={i}
                busy={busyId === c.id}
                onSelect={() => setSelecting(c)}
                onSkip={() => handleSkip(c)}
              />
            ))}
          </div>
        </>
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

function Header({ title }: { title: string }) {
  // The header used to show a "Next auto-report: 3d 16h" countdown,
  // but with the manual refresh button the wait-time framing felt
  // wrong — the inbox shouldn't punish first-time visitors. We just
  // surface the cadence as a small footnote.
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-3xl font-black font-space text-[#d3f5e8] tracking-tight">
        {title}
      </h1>
      <p className="text-xs text-[#91b2a6] font-space">
        Auto-refreshes every Saturday at 06:00 UTC. Tap the button below
        to draw a fresh report on demand.
      </p>
    </header>
  );
}

function EmptyState({
  text,
  refreshLabel,
  refreshing,
  onRefresh,
}: {
  text: string;
  refreshLabel: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 px-6 py-12 sm:py-16 text-center">
      <span className="material-symbols-outlined text-[#91b2a6] text-5xl">
        travel_explore
      </span>
      <p className="mt-4 text-sm text-[#91b2a6] font-space max-w-md mx-auto">
        {text}
      </p>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#a1ffc2] text-[#001e17] text-sm font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#a1ffc2]/20"
      >
        {refreshing ? (
          <span className="material-symbols-outlined text-[16px] animate-spin">
            progress_activity
          </span>
        ) : (
          <span className="material-symbols-outlined text-[16px]">casino</span>
        )}
        {refreshLabel}
      </button>
    </div>
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