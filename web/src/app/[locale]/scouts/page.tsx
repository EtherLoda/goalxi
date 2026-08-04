"use client";

import React, { Suspense, useEffect, useState } from "react";
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
  const tCommon = useTranslations("common");
  const search = useSearchParams();
  const { team } = useAuth();

  const teamIdFromQuery = search.get("team");
  const isOwnTeam = !teamIdFromQuery || teamIdFromQuery === team?.id;

  // Single-card inbox — the manager evaluates one dossier at a time
  // and SKIP / SIGN to move on. We track the *current* candidate
  // here; the list endpoint is used as a hydration step on mount
  // and after each action (so server-side expiry pruning is
  // automatically respected).
  const [current, setCurrent] = useState<ScoutCandidate | null>(null);
  const [weeklyDrawsRemaining, setWeeklyDrawsRemaining] = useState(0);
  const [weeklyCap, setWeeklyCap] = useState(3);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const loadInbox = React.useCallback(async () => {
    try {
      const list = await api.scouts.listCandidates();
      const head = list[0] ?? null;
      setCurrent(head);
      // The list endpoint populates the per-team draw budget on the
      // head candidate; if the inbox is empty the next draw will
      // re-sync via refreshCandidates' response.
      if (head) {
        setWeeklyDrawsRemaining(head.weeklyDrawsRemaining);
        setWeeklyCap(head.weeklyCap);
      }
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "load failed",
      });
      setCurrent(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadInbox().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [loadInbox]);

  // Draw exactly one new candidate and surface it. Server enforces
  // the per-team weekly cap (3) — when the cap is hit the request
  // fails with 429 and the body carries the budget. We surface that
  // as a clean error toast and leave the button disabled until the
  // counter resets at the next week boundary.
  const handleDraw = async () => {
    if (busy) return;
    if (weeklyDrawsRemaining <= 0) {
      setToast({ kind: "error", text: t("refreshCapReached") });
      return;
    }
    setBusy(true);
    setToast(null);
    try {
      const fresh = await api.scouts.refreshCandidates();
      if (fresh.length === 0) {
        setToast({ kind: "error", text: t("refreshEmpty") });
      } else {
        setCurrent(fresh[0]);
        setWeeklyDrawsRemaining(fresh[0].weeklyDrawsRemaining);
        setWeeklyCap(fresh[0].weeklyCap);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("refreshError");
      // The api client may surface 429 with the JSON body. Fall back
      // to the generic cap message if we can't extract it cleanly.
      const isCap =
        /cap|429|too many/i.test(message) ||
        (typeof (err as any)?.status === "number" &&
          (err as any).status === 429);
      setToast({
        kind: "error",
        text: isCap ? t("refreshCapReached") : message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSkip = async () => {
    if (!current || busy) return;
    setBusy(true);
    setToast(null);
    try {
      await api.scouts.skipCandidate(current.id);
      // After skip the candidate is deleted server-side, so re-pull
      // the inbox. If there's another candidate waiting, show it;
      // otherwise the empty state reappears.
      await loadInbox();
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "skip failed",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSign = async () => {
    if (!current || busy) return;
    setBusy(true);
    setToast(null);
    try {
      await api.scouts.selectCandidate(current.id);
      // Signing the candidate saturates the per-team weekly draw
      // counter server-side — the manager's pick for the week is
      // "spent". Mirror that on the client so the DRAW button
      // immediately flips to the cap-reached state, even before
      // `loadInbox` finishes re-pulling the (now-empty) inbox.
      setWeeklyDrawsRemaining(0);
      // The selected candidate is gone from the inbox; surface the
      // next one (or the empty state).
      await loadInbox();
      setToast({ kind: "success", text: t("selectSuccess") });
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : "select failed",
      });
    } finally {
      setBusy(false);
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

      <div className="flex justify-center">
        {loading ? (
          <div className="flex items-center gap-3 py-16 text-sm text-[#91b2a6] font-space">
            <span className="material-symbols-outlined animate-spin">
              progress_activity
            </span>
            {tCommon("loading")}
          </div>
        ) : current ? (
          <ScoutCard
            c={current}
            tPos={tPos}
            t={t}
            busy={busy}
            onSelect={handleSign}
            onSkip={handleSkip}
          />
        ) : (
          <EmptyState
            text={t("empty")}
            refreshLabel={
              busy
                ? t("refreshing")
                : weeklyDrawsRemaining > 0
                  ? t("refresh")
                  : t("refreshCapReached")
            }
            refreshing={busy}
            capReached={weeklyDrawsRemaining <= 0}
            onRefresh={handleDraw}
          />
        )}
      </div>

      {/* Floating draw button when a card is on screen — manager
          can pull the next dossier without going through skip. */}
      {current && !loading && (
        <div className="flex justify-center">
          <button
            onClick={handleDraw}
            disabled={busy || weeklyDrawsRemaining <= 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#a1ffc2]/10 border border-[#a1ffc2]/30 text-[#a1ffc2] text-xs font-bold uppercase tracking-wider hover:bg-[#a1ffc2]/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <span className="material-symbols-outlined text-[14px] animate-spin">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[14px]">
                refresh
              </span>
            )}
            {busy
              ? t("refreshing")
              : weeklyDrawsRemaining > 0
                ? `${t("refreshNext")} · ${weeklyDrawsRemaining}/${weeklyCap}`
                : t("refreshCapReached")}
          </button>
        </div>
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
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-3xl font-black font-space text-[#d3f5e8] tracking-tight">
        {title}
      </h1>
      <p className="text-xs text-[#91b2a6] font-space">
        Auto-refreshes every Saturday at 06:00 UTC. Draw a fresh
        dossier below.
      </p>
    </header>
  );
}

function EmptyState({
  text,
  refreshLabel,
  refreshing,
  capReached,
  onRefresh,
}: {
  text: string;
  refreshLabel: string;
  refreshing: boolean;
  capReached: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="bg-[#00251c]/60 rounded-2xl border border-white/5 px-6 py-12 sm:py-16 text-center w-full max-w-[580px]">
      <span className="material-symbols-outlined text-[#91b2a6] text-5xl">
        travel_explore
      </span>
      <p className="mt-4 text-sm text-[#91b2a6] font-space max-w-md mx-auto">
        {text}
      </p>
      <button
        onClick={onRefresh}
        disabled={refreshing || capReached}
        className={
          capReached
            ? "mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 text-[#91b2a6] text-sm font-bold uppercase tracking-wider cursor-not-allowed border border-white/10"
            : "mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#a1ffc2] text-[#001e17] text-sm font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#a1ffc2]/20"
        }
      >
        {refreshing ? (
          <span className="material-symbols-outlined text-[16px] animate-spin">
            progress_activity
          </span>
        ) : capReached ? (
          <span className="material-symbols-outlined text-[16px]">block</span>
        ) : (
          <span className="material-symbols-outlined text-[16px]">casino</span>
        )}
        {refreshLabel}
      </button>
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
