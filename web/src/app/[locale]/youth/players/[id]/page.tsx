"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, type Player } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

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

/** Display labels for the skill keys, shared with the senior squad view. */
const SKILL_LABEL: Record<string, { en: string; zh: string }> = {
  pace: { en: "Pace", zh: "速度" },
  strength: { en: "Strength", zh: "力量" },
  finishing: { en: "Finishing", zh: "射门" },
  passing: { en: "Passing", zh: "传球" },
  dribbling: { en: "Dribbling", zh: "盘带" },
  defending: { en: "Defending", zh: "防守" },
  reflexes: { en: "Reflexes", zh: "反应" },
  handling: { en: "Handling", zh: "接球" },
  aerial: { en: "Aerial", zh: "高空" },
  positioning: { en: "Positioning", zh: "跑位" },
  composure: { en: "Composure", zh: "冷静" },
  freeKicks: { en: "Free Kicks", zh: "任意球" },
  penalties: { en: "Penalties", zh: "点球" },
};

const POTENTIAL_TIER_COLOR: Record<string, string> = {
  LOW: "text-[#91b2a6] bg-[#91b2a6]/10",
  REGULAR: "text-[#a1ffc2] bg-[#a1ffc2]/10",
  HIGH_PRO: "text-[#fbbf24] bg-[#fbbf24]/10",
  ELITE: "text-[#f472b6] bg-[#f472b6]/10",
  LEGEND: "text-[#a78bfa] bg-[#a78bfa]/10",
};

function getExpectedKeys(p: Player): string[] {
  return p.isGoalkeeper ? GK_KEYS : OUTFIELD_KEYS;
}

function getRequiredRevealCount(p: Player): number {
  return Math.ceil(getExpectedKeys(p).length * 0.5);
}

export default function YouthPlayerDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = useTranslations("youth.squad");
  const tPos = useTranslations("youth.squad.position");
  const tPot = useTranslations("youth.squad.potentialLabel");
  const router = useRouter();
  const routeParams = useParams();
  const { team } = useAuth();

  const locale = (routeParams.locale as string) || "en";
  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  const isOwnTeam = team != null; // detail page is team-scoped via auth

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.players
      .getById(params.id)
      .then((data) => {
        if (!cancelled) setPlayer(data);
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

  const canPromote = useMemo(() => {
    if (!player) return false;
    return (
      !player.isPromoted &&
      (player.revealedSkills?.length ?? 0) >= getRequiredRevealCount(player)
    );
  }, [player]);

  const handlePromote = async () => {
    if (!player) return;
    setPromoting(true);
    setToast(null);
    try {
      await api.players.promote(player.id);
      setToast({
        kind: "success",
        text: t("promoteSuccess", { name: player.name }),
      });
      // After a moment, navigate back to the squad list.
      setTimeout(() => {
        router.push(`/${locale}/youth/squad?team=${team?.id ?? ""}`);
      }, 1500);
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : t("promoteError"),
      });
      setPromoting(false);
    }
  };

  if (error) {
    return (
      <div className="px-8 py-6">
        <div className="bg-error/10 border border-error/30 rounded-xl p-6 text-error text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="px-8 py-6">
        <div className="text-[#91b2a6] text-sm font-space">Loading…</div>
      </div>
    );
  }

  const expectedKeys = getExpectedKeys(player);
  const requiredCount = getRequiredRevealCount(player);
  const total = expectedKeys.length;
  const revealedCount = player.revealedSkills?.length ?? 0;
  const tier = player.potentialTier;
  const tierClass = tier
    ? POTENTIAL_TIER_COLOR[tier] ?? POTENTIAL_TIER_COLOR.LOW
    : "bg-[#2f4e44]/40 text-[#91b2a6]";

  return (
    <div className="px-8 py-6 space-y-6">
      <BackBar
        href={`/${locale}/youth/squad?team=${team?.id ?? ""}`}
        label="← Back to squad"
      />

      {/* Header card */}
      <header className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black font-space text-[#d3f5e8]">
              {player.name}
            </h1>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tierClass}`}
            >
              {player.potentialRevealed && tier ? tPot(tier) : "?"}
            </span>
          </div>
          <p className="mt-2 text-sm text-[#91b2a6] font-space">
            {player.nationality ?? "—"} ·{" "}
            {player.isGoalkeeper ? tPos("GK") : tPos("OUT")} · age{" "}
            {player.age} ·{" "}
            {player.joinedAt &&
              t("joinedOn", {
                date: new Date(player.joinedAt).toLocaleDateString(locale),
              })}
          </p>
          {player.abilities && player.abilities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {player.abilities.map((a) => (
                <span
                  key={a}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#a1ffc2]/10 text-[#a1ffc2] font-bold uppercase tracking-wider"
                >
                  {a.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {player.isPromoted ? (
            <span className="px-3 py-1.5 rounded-lg bg-[#a1ffc2]/20 text-[#a1ffc2] text-[11px] font-bold uppercase tracking-wider">
              ✓ Senior
            </span>
          ) : (
            <button
              onClick={handlePromote}
              disabled={!canPromote || promoting || !isOwnTeam}
              title={!canPromote ? t("promoteDisabledReason") : ""}
              className={
                canPromote
                  ? "inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#a1ffc2] text-[#001e17] text-sm font-bold uppercase tracking-wider hover:bg-[#b9ffce] transition-colors disabled:opacity-50"
                  : "inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-[#2f4e44]/30 text-[#91b2a6] text-sm font-bold uppercase tracking-wider cursor-not-allowed"
              }
            >
              {promoting ? (
                <span className="material-symbols-outlined text-[14px] animate-spin">
                  progress_activity
                </span>
              ) : (
                <span className="material-symbols-outlined text-[14px]">
                  trending_up
                </span>
              )}
              {t("promote")}
            </button>
          )}
        </div>
      </header>

      {/* Reveal progress */}
      <section className="bg-[#00251c]/60 rounded-2xl border border-white/5 p-6 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#91b2a6]">
            Scout progress · Week {player.revealLevel}
          </h2>
          <span
            className={
              canPromote
                ? "text-[11px] font-bold text-[#a1ffc2] uppercase tracking-wider"
                : "text-[11px] font-bold text-[#91b2a6] uppercase tracking-wider"
            }
          >
            {revealedCount} / {total} revealed
            {canPromote && " · ready to promote"}
          </span>
        </div>
        <div className="h-2 rounded-full bg-[#001e17] overflow-hidden">
          <div
            className={
              canPromote
                ? "h-full bg-[#a1ffc2]"
                : "h-full bg-gradient-to-r from-[#a78bfa] to-[#60a5fa]"
            }
            style={{ width: `${(revealedCount / total) * 100}%` }}
          />
        </div>
        <p className="text-[11px] text-[#91b2a6] font-space">
          Need at least {requiredCount} of {total} skills revealed to promote.
        </p>
      </section>

      {/* Skill grid */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#91b2a6] mb-3">
          Skills
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {expectedKeys.map((key) => {
            const isRevealed = (player.revealedSkills ?? []).includes(key);
            const cur = isRevealed
              ? (player.currentSkills as any)?.[key]
              : undefined;
            const pot = isRevealed
              ? (player.potentialSkills as any)?.[key]
              : undefined;
            const label =
              SKILL_LABEL[key]?.[locale === "zh" ? "zh" : "en"] ?? key;
            return (
              <SkillBar
                key={key}
                label={label}
                current={cur}
                potential={pot}
                isRevealed={isRevealed}
              />
            );
          })}
        </div>
      </section>

      {toast && (
        <ToastInline
          kind={toast.kind}
          text={toast.text}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}

function BackBar({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-xs text-[#91b2a6] hover:text-[#a1ffc2] transition-colors font-space"
    >
      <span className="material-symbols-outlined text-base">arrow_back</span>
      {label}
    </Link>
  );
}

function SkillBar({
  label,
  current,
  potential,
  isRevealed,
}: {
  label: string;
  current?: number;
  potential?: number;
  isRevealed: boolean;
}) {
  if (!isRevealed) {
    return (
      <div className="bg-[#00251c]/60 rounded-xl border border-white/5 p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#001e17] flex items-center justify-center">
          <span className="material-symbols-outlined text-[#91b2a6] text-base">
            lock
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-[#91b2a6] font-bold uppercase tracking-wider truncate">
            {label}
          </p>
          <p className="text-[10px] text-[#2f4e44] font-space mt-0.5">
            Hidden — wait for next weekly reveal
          </p>
        </div>
      </div>
    );
  }

  const cur = current ?? 0;
  const pot = potential ?? 0;
  const fillPct = pot > 0 ? Math.min(100, (cur / pot) * 100) : 0;

  return (
    <div className="bg-[#00251c]/60 rounded-xl border border-white/5 p-4">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs text-[#d3f5e8] font-bold uppercase tracking-wider">
          {label}
        </p>
        <p className="text-xs text-[#91b2a6] tabular-nums">
          <span className="text-[#d3f5e8] font-bold">{cur.toFixed(1)}</span>
          <span className="text-[#2f4e44] mx-1">/</span>
          <span className="text-[#a1ffc2]">{pot.toFixed(1)}</span>
        </p>
      </div>
      <div className="h-2 rounded-full bg-[#001e17] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#a78bfa] to-[#a1ffc2]"
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}

function ToastInline({
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