"use client";

import { useTranslations } from "next-intl";
import { formatRecoveryWeeks } from "@/lib/format-recovery-weeks";
import type { Player } from "@/lib/api";

type InjuryState = "minor" | "severe" | null;
type InjuryType = NonNullable<Player["injuryType"]>;

interface InjuryBadgeProps {
  player: Pick<Player, "currentInjuryValue" | "injuryType" | "injuryState">;
  /** When provided, use this value to render the recovery estimate. */
  estimatedDays?: number;
  className?: string;
}

const SEVERE_CLASSES = "bg-error/15 text-error border-error/30";
const MINOR_CLASSES = "bg-amber-400/15 text-amber-300 border-amber-400/30";

export function InjuryBadge({
  player,
  estimatedDays,
  className,
}: InjuryBadgeProps) {
  const t = useTranslations("medical");
  const value = player.currentInjuryValue ?? 0;

  if (value <= 0) return null;

  const state: InjuryState = player.injuryState ?? "severe";
  const isMinor = state === "minor";

  const injuryType: InjuryType = (player.injuryType as InjuryType) ?? "other";
  const typeLabel = t(`injuryTypes.${injuryType}`);

  const weeks = formatRecoveryWeeks(
    estimatedDays ?? Math.ceil(value / 7),
  );
  const weeksLabel = t("recoveryWeeks", { n: weeks });

  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider whitespace-nowrap",
        isMinor ? MINOR_CLASSES : SEVERE_CLASSES,
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={typeLabel}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: "12px", fontVariationSettings: "'FILL' 1" }}
        aria-hidden
      >
        {isMinor ? "healing" : "local_hospital"}
      </span>
      <span>{typeLabel}</span>
      <span aria-hidden>·</span>
      <span>{weeksLabel}</span>
      {isMinor && (
        <span
          className="px-1 rounded-sm bg-amber-400/20 text-amber-200 ml-0.5"
          title={t("minorAbleToPlay")}
        >
          {t("minorBadge")}
        </span>
      )}
    </span>
  );
}

export default InjuryBadge;
