"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import Link from "next/link";
import type { CupMatch } from "@/lib/cup-api";

interface MatchCardProps {
  match: CupMatch;
  /** Optional kickoff time for the round — used to show "TBD" when
   *  the slot is set up but the actual match row hasn't been
   *  materialised yet. */
  roundScheduledAt: string | null;
  /** Locale string for the link href. Defaults to "en" if not
   *  passed (the bracket is rendered under /[locale]/cup/[id]). */
  locale?: string;
}

/**
 * One match in the bracket. Renders four states:
 *  - bye             : a single team advancing, no opponent
 *  - not-started     : both teams known, no winner yet
 *  - in-progress     : both teams known, currently being played
 *  - completed       : winnerTeamId is set, winner highlighted
 *
 * Real matches wrap the body in a Next Link so users can click
 * through to the match detail page (`/matches/[id]`). Byes are
 * not linkable — there's no match row.
 */
export default function MatchCard({
  match,
  roundScheduledAt,
  locale = "en",
}: MatchCardProps) {
  const t = useTranslations("cup.match");

  const home = match.homeTeam;
  const away = match.awayTeam;
  const winnerId = match.winnerTeamId;
  const hasResult = Boolean(winnerId);

  // kickoff label. If the API didn't attach a per-match scheduledAt
  // (it currently doesn't — the round-level one is the source of
  // truth) we fall back to the round's scheduledAt.
  const kickoff = match.scheduledAt ?? roundScheduledAt;
  const kickoffLabel = useMemo(() => {
    if (!kickoff) return null;
    try {
      return new Date(kickoff).toLocaleString();
    } catch {
      return kickoff;
    }
  }, [kickoff]);

  // Bye is a single-team slot — the FE never expects an opponent
  // in this case (the API surfaces it as `isBye: true` with the
  // single team on the home side).
  if (match.isBye || (!home && !away)) {
    return (
      <div className="glass-panel p-4 rounded-xl border border-outline-variant/10 flex items-center justify-between">
        <div className="font-headline text-sm font-bold text-on-surface/80">
          {home?.name ?? t("tbd")}
        </div>
        <span className="font-label text-[10px] font-black uppercase tracking-[0.15em] text-primary/80 bg-primary/10 px-2 py-0.5 rounded">
          {t("bye")}
        </span>
      </div>
    );
  }

  return (
    <Link
      href={`/${locale}/matches/${match.matchId}`}
      className="block glass-panel p-4 rounded-xl border border-outline-variant/10 space-y-2 hover:border-primary/30 hover:shadow-[0_0_18px_rgba(0,228,121,0.15)] transition-all"
    >
      <div className="flex items-center justify-between">
        <TeamRow
          name={home?.name ?? t("tbd")}
          tier={home?.tier}
          isWinner={hasResult && winnerId === home?.id}
          isLoser={hasResult && winnerId !== null && winnerId !== home?.id}
        />
      </div>
      <div className="h-px bg-outline-variant/10" />
      <div className="flex items-center justify-between">
        <TeamRow
          name={away?.name ?? t("tbd")}
          tier={away?.tier}
          isWinner={hasResult && winnerId === away?.id}
          isLoser={hasResult && winnerId !== null && winnerId !== away?.id}
        />
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-label text-[10px] font-bold uppercase tracking-[0.15em] text-on-surface-variant/60">
          {hasResult ? t("completed") : kickoff ? t("scheduled") : t("tbd")}
        </span>
        {kickoffLabel && !hasResult && (
          <span className="font-body text-[11px] text-on-surface-variant/70">
            {t("kickoff", { time: kickoffLabel })}
          </span>
        )}
      </div>
    </Link>
  );
}

interface TeamRowProps {
  name: string;
  tier: number | undefined;
  isWinner: boolean;
  isLoser: boolean;
}

function TeamRow({ name, tier, isWinner, isLoser }: TeamRowProps) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className={
          "font-headline text-sm font-bold truncate " +
          (isWinner
            ? "text-primary"
            : isLoser
              ? "text-on-surface/50 line-through"
              : "text-on-surface")
        }
      >
        {name}
      </span>
      {tier !== undefined && tier > 0 && (
        <span className="font-label text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant/50 bg-surface-container/50 px-1.5 py-0.5 rounded shrink-0">
          L{tier}
        </span>
      )}
      {isWinner && (
        <span className="material-symbols-outlined text-base text-primary shrink-0">
          check_circle
        </span>
      )}
    </div>
  );
}
