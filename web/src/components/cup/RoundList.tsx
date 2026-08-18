"use client";

import { useTranslations } from "next-intl";
import type { CupRound } from "@/lib/cup-api";
import MatchCard from "./MatchCard";

interface RoundListProps {
  round: CupRound;
  /** Locale string used for the click-through match-detail link
   *  inside each MatchCard. Defaults to "en" if not passed. */
  locale?: string;
}

/**
 * R0..R7 list view: a 2/3/4-column responsive grid of MatchCards.
 * 32-512 matches in a round would crush a single column, so we
 * rely on the column count to keep cards compact. No tree
 * rendering here — by design.
 */
export default function RoundList({ round, locale = "en" }: RoundListProps) {
  const t = useTranslations("cup.match");
  const matches = round.matches;

  if (matches.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">
          hourglass_empty
        </span>
        <p className="font-headline text-on-surface-variant">{t("tbd")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {matches.map((m, i) => (
        <MatchCard
          key={m.matchId ?? `bye-${i}`}
          match={m}
          roundScheduledAt={round.scheduledAt}
          locale={locale}
        />
      ))}
    </div>
  );
}
