"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cupApi, type CupBracket as CupBracketData } from "@/lib/cup-api";
import RoundTabs from "./RoundTabs";
import RoundList from "./RoundList";
import RoundTree from "./RoundTree";

interface CupBracketProps {
  cupId: string;
  /** Locale string used to build the click-through match-detail
   *  links inside each MatchCard / TreeMatchCard. Defaults to
   *  "en" if not passed. */
  locale?: string;
}

/**
 * The last 4 rounds of any cup form a "tree" — 16→8→4→2→1.
 *  - L1-L4 MVP: R8..R11 (12 rounds total, last 4 = 16→1)
 *  - L1-L6:     R13..R16 (17 rounds total, last 4 = 16→1)
 *  - future cups with 32-team late stage: last 5 rounds
 * We pick the threshold off the actual cup size, not hard-coded.
 */
function treeStartRound(totalRounds: number): number {
  // 4 rounds = 16→1. If a cup's last 5 rounds form a 32→1 tree,
  // the user just sees more early list rounds — the threshold
  // here is "the round where 16 teams remain".
  return Math.max(0, totalRounds - 4);
}

export default function CupBracket({ cupId, locale = "en" }: CupBracketProps) {
  const t = useTranslations("cup");
  const [bracket, setBracket] = useState<CupBracketData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRound, setSelectedRound] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    cupApi
      .getBracket(cupId)
      .then((data) => {
        if (!cancelled) {
          setBracket(data);
          // Default: open the most recent round with any matches
          // (the one in progress, or the last completed one if
          // the cup hasn't started yet).
          const last = [...data.rounds]
            .reverse()
            .find((r) => r.matches.length > 0);
          setSelectedRound(last?.roundNumber ?? 0);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? t("loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [cupId, t]);

  const totalRounds = bracket?.rounds.length ?? 0;
  const treeStart = useMemo(
    () => (totalRounds ? treeStartRound(totalRounds) : 0),
    [totalRounds],
  );

  if (error) {
    return (
      <div className="glass-panel p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
        <div className="flex items-center gap-3 font-body text-sm text-red-300">
          <span className="material-symbols-outlined">error</span>
          {error}
        </div>
      </div>
    );
  }

  if (!bracket) {
    return (
      <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block animate-pulse">
          hourglass_empty
        </span>
        <p className="font-headline text-on-surface-variant">{t("loading")}</p>
      </div>
    );
  }

  const selectedRoundData = bracket.rounds.find(
    (r) => r.roundNumber === selectedRound,
  );
  const isTreeRound = selectedRound >= treeStart;
  const treeRounds = bracket.rounds.filter(
    (r) => r.roundNumber >= treeStart,
  );

  return (
    <div className="space-y-6">
      <RoundTabs
        rounds={bracket.rounds}
        selectedRound={selectedRound}
        onSelect={setSelectedRound}
      />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-headline font-black text-xl uppercase tracking-tight text-[#d3f5e8]">
            {selectedRoundData?.roundName}
          </h2>
          <p className="font-body text-xs text-on-surface-variant/70 mt-0.5">
            {t("round.kind." + (selectedRoundData?.kind ?? "qualifying"))} ·{" "}
            {t("status." + (selectedRoundData?.status ?? "pending"))}
          </p>
        </div>
        <div className="font-label text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant/60">
          {t("roundView." + (isTreeRound ? "tree" : "list"))}
        </div>
      </div>

      {isTreeRound ? (
        <RoundTree rounds={treeRounds} locale={locale} />
      ) : selectedRoundData ? (
        <RoundList round={selectedRoundData} locale={locale} />
      ) : null}
    </div>
  );
}
