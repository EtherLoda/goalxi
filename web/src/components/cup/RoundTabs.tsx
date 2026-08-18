"use client";

import { useTranslations } from "next-intl";
import type { CupRound } from "@/lib/cup-api";

interface RoundTabsProps {
  rounds: CupRound[];
  selectedRound: number;
  onSelect: (roundNumber: number) => void;
}

/**
 * Horizontal scroll-snap tab strip across the top of the bracket
 * page. One tab per round. The tab label is the round's
 * `roundName` from the server (so the generator's "Pre-Qualifying"
 * / "R3 Proper" / "Quarter-Final" labels carry through).
 *
 * Each tab shows a tiny status dot:
 *  - gray   : pending
 *  - amber  : in_progress
 *  - primary: completed
 *
 * 12 tabs is a lot — the strip is `overflow-x-auto` so the user
 * can swipe horizontally on narrow viewports.
 */
export default function RoundTabs({
  rounds,
  selectedRound,
  onSelect,
}: RoundTabsProps) {
  const t = useTranslations("cup");
  return (
    <div className="overflow-x-auto -mx-2 px-2 pb-2">
      <div className="flex gap-2 min-w-max">
        {rounds.map((r) => {
          const isActive = selectedRound === r.roundNumber;
          return (
            <button
              key={r.roundNumber}
              onClick={() => onSelect(r.roundNumber)}
              className={
                "shrink-0 px-3 py-2 rounded-lg border transition-all text-left " +
                (isActive
                  ? "bg-primary/10 border-primary/40"
                  : "bg-surface-container/30 border-outline-variant/10 hover:border-outline-variant/30")
              }
            >
              <div className="flex items-center gap-2">
                <StatusDot status={r.status} />
                <div>
                  <div
                    className={
                      "font-label text-[10px] font-black uppercase tracking-[0.15em] " +
                      (isActive
                        ? "text-primary"
                        : "text-on-surface-variant/70")
                    }
                  >
                    {t("round.tab", { number: r.roundNumber + 1 })}
                  </div>
                  <div
                    className={
                      "font-headline text-xs font-bold " +
                      (isActive ? "text-on-surface" : "text-on-surface/70")
                    }
                  >
                    {r.roundName}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: CupRound["status"] }) {
  const cls =
    status === "completed"
      ? "bg-primary"
      : status === "in_progress"
        ? "bg-amber-400"
        : "bg-on-surface-variant/30";
  return <span className={"w-2 h-2 rounded-full " + cls} />;
}
