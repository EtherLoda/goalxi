"use client";

import { AppIcon, type MaterialIconName } from "@/components/icons/AppIcon";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

// Mirror of `libs/database/src/constants/stadium-construction.constants.ts` —
// the web package doesn't depend on `@goalxi/database`, so we redeclare the
// bounds we need here. Keep these in sync if the constants change.
const SEAT_DEMOLISH_REFUND_RATE = 0.15;
const STADIUM_CONSTRUCTION_MIN_SEATS = 500;
const STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB = 100_000;
const STADIUM_CONSTRUCTION_SEATS_PER_WEEK = 5_000;
const STADIUM_DEMOLISH_SEATS_PER_WEEK = 10_000;
const STADIUM_MIN_CAPACITY = 1_000;

interface ConstructionDialogProps {
  kind: "expand" | "demolish";
  teamId: string;
  currentCapacity: number;
  /** Cost per seat for EXPAND (mirrors `StadiumSummary.seatAdjustCost`). */
  costPerSeat: number;
  /**
   * Per-seat price the match engine actually pays out, already including
   * the league-tier multiplier (mirrors `StadiumSummary.ticketPrice`).
   * The preview multiplies it by capacity to show the SOLD-OUT ceiling —
   * it deliberately does NOT extrapolate the club's current (attendance
   * based) revenue, because extra seats only earn once somebody sits in
   * them.
   */
  ticketPrice: number;
  /**
   * Seats the current stadium LEVEL allows. Expansion is bounded by this,
   * not by the absolute cap — a level-1 ground cannot be dragged to 25,000
   * and then rejected, it simply cannot reach it.
   */
  capacityCap: number;
  onCancel: () => void;
  onSuccess: (info: { delta: number; weeks: number; cost: number }) => void;
}

/**
 * Drag-to-adjust dialog that queues a new stadium construction project.
 *
 * The slider is a native `<input type="range">` so it inherits
 * native touch / keyboard / a11y behaviour and supports drag-
 * without-jumping. Bounds come from the shared
 * `stadium-construction.constants.ts` so server validation
 * never rejects what the UI just accepted.
 *
 * Live preview block (cost / refund / weeks / capacity before → after)
 * gives the manager instant feedback while dragging. Submit posts to the
 * api; on success the parent page refreshes and shows a toast.
 */
export function ConstructionDialog({
  kind,
  teamId,
  currentCapacity,
  costPerSeat,
  ticketPrice,
  capacityCap,
  onCancel,
  onSuccess,
}: ConstructionDialogProps) {
  const t = useTranslations("club.stadiumPage.constructionDialog");
  const tCommon = useTranslations();

  const min = STADIUM_CONSTRUCTION_MIN_SEATS;
  const max = Math.min(
    STADIUM_CONSTRUCTION_MAX_SEATS_PER_JOB,
    kind === "expand"
      ? Math.max(0, capacityCap - currentCapacity)
      : currentCapacity - STADIUM_MIN_CAPACITY,
  );
  const initial = Math.min(
    Math.max(5_000, min),
    Math.max(min, max),
  );
  const step = kind === "expand" ? 100 : 100;

  const [delta, setDelta] = useState<number>(initial);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weeks = useMemo(
    () =>
      kind === "expand"
        ? Math.max(
            1,
            Math.ceil(delta / STADIUM_CONSTRUCTION_SEATS_PER_WEEK),
          )
        : Math.max(
            1,
            Math.ceil(delta / STADIUM_DEMOLISH_SEATS_PER_WEEK),
          ),
    [delta, kind],
  );
  const cost = delta * costPerSeat;
  const refund =
    kind === "demolish"
      ? Math.floor(delta * costPerSeat * SEAT_DEMOLISH_REFUND_RATE)
      : 0;
  const nextCapacity =
    kind === "expand" ? currentCapacity + delta : currentCapacity - delta;
  // Sell-out ceiling before and after. Linear in capacity is correct here
  // precisely because it is the *ceiling*: every extra seat is worth
  // exactly one ticket IF somebody sits in it. Whether anybody does is a
  // question about the fan base, not about the stadium.
  const currentMaxRevenue = Math.round(currentCapacity * ticketPrice);
  const nextMaxRevenue = Math.round(nextCapacity * ticketPrice);
  const revenueDelta = nextMaxRevenue - currentMaxRevenue;

  const clamped = Math.min(max, Math.max(min, delta));
  const canSubmit = clamped >= min && clamped <= max && !isSubmitting;
  const title =
    kind === "expand" ? t("titleExpand") : t("titleDemolish");

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.stadium.startConstruction(teamId, {
        kind,
        delta: clamped,
      });
      onSuccess({ delta: clamped, weeks, cost });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : tCommon("common.error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="glass-panel rounded-2xl p-6 w-full max-w-md mx-4 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <div
            className={
              "flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] mb-1 " +
              (kind === "expand" ? "text-primary" : "text-error")
            }
          >
            <AppIcon name={kind === "expand" ? "add_circle" : "remove_circle"} className="text-base" />
            <span>{title}</span>
          </div>
          <h2 className="font-headline text-xl font-black text-on-surface tracking-tight">
            {title}
          </h2>
        </header>

        {/* Slider */}
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-headline text-4xl font-black text-on-surface tabular-nums">
              {kind === "expand" ? "+" : "−"}
              {clamped.toLocaleString()}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              {t("dragLabel")}
            </span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={clamped}
            onChange={(e) => setDelta(Number(e.target.value))}
            disabled={isSubmitting}
            className="w-full accent-primary"
            aria-label={t("dragLabel")}
          />
          <div className="flex items-center justify-between text-[10px] text-on-surface-variant mt-1">
            <span>{t("minHint", { min: min.toLocaleString() })}</span>
            <span>{t("maxHint", { max: max.toLocaleString() })}</span>
          </div>
        </div>

        {/* Live preview */}
        <div className="grid grid-cols-2 gap-3">
          <PreviewStat
            label={t("previewCurrent")}
            value={currentCapacity.toLocaleString()}
            icon="event_seat"
          />
          <PreviewStat
            label={t("previewNext")}
            value={nextCapacity.toLocaleString()}
            icon="event_seat"
            tone={kind === "expand" ? "primary" : "error"}
          />
          <PreviewStat
            label={t("revenueCurrent")}
            value={currentMaxRevenue.toLocaleString()}
            icon="payments"
          />
          <PreviewStat
            label={t("revenueNext")}
            value={nextMaxRevenue.toLocaleString()}
            icon="payments"
            tone={
              revenueDelta > 0
                ? "primary"
                : revenueDelta < 0
                  ? "error"
                  : undefined
            }
          />
          {kind === "expand" ? (
            <PreviewStat
              label={t("costLabel")}
              value={`−${cost.toLocaleString()}`}
              icon="account_balance_wallet"
              tone="primary"
            />
          ) : (
            <PreviewStat
              label={t("refundLabel")}
              value={`+${refund.toLocaleString()}`}
              icon="account_balance_wallet"
              tone="error"
            />
          )}
          <PreviewStat
            label={t("weeksLabel")}
            value={t("weeksValue", { n: weeks })}
            icon="schedule"
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg border border-error/30 bg-error/10 text-error text-xs">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 px-3 py-2.5 rounded-lg border border-outline-variant/30 text-on-surface-variant font-headline text-xs font-bold uppercase tracking-widest hover:text-on-surface transition-colors disabled:opacity-50"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={
              "flex-1 px-3 py-2.5 rounded-lg font-headline text-xs font-bold uppercase tracking-widest disabled:opacity-40 transition-opacity flex items-center justify-center gap-1.5 " +
              (kind === "expand"
                ? "bg-primary text-on-primary hover:opacity-90"
                : "bg-error text-on-error hover:opacity-90")
            }
          >
            <AppIcon name={isSubmitting ? "hourglass_empty" : "check"} className="text-base" />
            {isSubmitting
              ? t("submitting")
              : kind === "expand"
                ? t("confirmExpand")
                : t("confirmDemolish")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: MaterialIconName;
  tone?: "primary" | "error";
}) {
  return (
    <div className="bg-surface-container/70 rounded-lg p-3 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-1">
        <span className="font-label text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
          {label}
        </span>
        <AppIcon name={icon} className={(tone === "primary"
              ? "text-primary"
              : tone === "error"
                ? "text-error"
                : "text-on-surface-variant")} />
      </div>
      <div className="font-headline text-lg font-black text-on-surface tabular-nums">
        {value}
      </div>
    </div>
  );
}