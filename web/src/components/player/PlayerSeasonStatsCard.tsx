"use client";

/**
 * Per-player competition-stats card.
 *
 * Renders career totals + every (league, season) row from
 * `GET /stats/player/:id/seasons`. Goals / assists / tackles /
 * yellow / red cards / appearances are surfaced in two layers:
 *
 *  1. Career totals strip \u2014 four big-number KPI tiles so a
 *     visitor can read a player\'s full contribution at a glance.
 *  2. Per-season table \u2014 one row per (league, season) the player
 *     has recorded. Cup / youth rows have null leagueId and are
 *     labelled with the `cupLabel` translation (default "Cup";
 *     override at the consumer level if the project enables
 *     youth leagues).
 *
 * Visual language follows the rest of GoalXI: dark slate cards
 * (`bg-[#001e17] / border-[#2f4e44]/20`), mint primary text
 * (`#a1ffc2`), and the same 1.5x4 colored-bar + uppercase
 * tracking-widest label pattern used in the skill section.
 *
 * All user-visible strings go through `useTranslations("player_stats")`
 * \u2014 the namespace lives in `web/messages/{en,zh}.json`. The
 * component does NOT take a `locale` prop; next-intl\'s
 * `NextIntlClientProvider` (set up in `app/[locale]/layout.tsx`)
 * supplies the right dictionary.
 *
 * Re-fetches on `playerId` change or when the parent bumps
 * `refreshSignal` (e.g. after a live match completes). The
 * Retry button on errors bumps an internal counter that
 * re-runs the same effect.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type PlayerSeasonStats } from "@/lib/api";

export interface PlayerSeasonStatsCardProps {
  playerId: number;
  /**
   * Bump from the parent to force a re-fetch (e.g. after a match
   * involving this player completes). Defaults to 0 (fetch on
   * mount only).
   */
  refreshSignal?: number;
}

function KpiTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "mint" | "lime" | "amber" | "sky";
}) {
  const accentClass = {
    mint: "text-[#a1ffc2]",
    lime: "text-[#abf853]",
    amber: "text-[#f59e0b]",
    sky: "text-[#60a5fa]",
  }[accent];
  return (
    <div className="bg-[#00251c] rounded-xl p-3 flex flex-col items-center justify-center border border-[#2f4e44]/10 min-h-[64px]">
      <div className={`text-2xl font-black font-space leading-none ${accentClass}`}>
        {value}
      </div>
      <span className="text-[8px] font-bold font-space mt-1.5 tracking-widest uppercase text-[#91b2a6]">
        {label}
      </span>
    </div>
  );
}

/** "12 (3)" for "12 starts of which 3 were as sub" in compact form. */
function startsWithSub(starts: number, subs: number): string {
  if (subs === 0) return String(starts);
  return `${starts} (${subs})`;
}

function SeasonRow({
  row,
  cupLabel,
}: {
  row: PlayerSeasonStats["seasons"][number];
  cupLabel: string;
}) {
  // Cup / youth rows come from match.leagueId = null. We can\'t
  // tell them apart from the row alone, so label with the
  // localised cupLabel and let the consumer override at the
  // page level if the project enables youth leagues.
  const competitionLabel = row.leagueName ?? cupLabel;
  return (
    <div className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg bg-[#001a12] border border-[#2f4e44]/10 hover:bg-[#00251c] transition-colors">
      <div className="col-span-2 flex items-center">
        <span className="text-[10px] font-black font-space tracking-wider text-[#d3f5e8]">
          S{row.season}
        </span>
      </div>
      <div className="col-span-3 text-[10px] font-bold font-space text-[#91b2a6] truncate">
        {competitionLabel}
      </div>
      <div className="col-span-3 text-[10px] font-bold font-space text-[#91b2a6] truncate">
        {row.teamName}
      </div>
      <div className="col-span-1 text-center text-sm font-black font-space text-[#d3f5e8]">
        {row.appearances}
      </div>
      <div className="col-span-1 text-center text-sm font-black font-space text-[#a1ffc2]">
        {row.goals}
      </div>
      <div className="col-span-1 text-center text-sm font-black font-space text-[#60a5fa]">
        {row.assists}
      </div>
      <div className="col-span-1 text-center text-[11px] font-bold font-space text-[#abf853]">
        {startsWithSub(row.starts, row.substituteAppearances)}
      </div>
    </div>
  );
}

function EmptyState({ t }: { t: ReturnType<typeof useTranslations<"player_stats">> }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-full bg-[#00251c] border border-[#2f4e44]/20 flex items-center justify-center mb-2">
        <span className="material-icons text-[#91b2a6] text-lg">sports_soccer</span>
      </div>
      <p className="text-[10px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
        {t("emptyTitle")}
      </p>
      <p className="text-[9px] font-space text-[#4a7a6a] mt-1 max-w-[240px]">
        {t("emptyBody")}
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div aria-busy="true" className="space-y-4 animate-pulse">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[64px] rounded-xl bg-[#00251c] border border-[#2f4e44]/10"
          />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[40px] rounded-lg bg-[#001a12] border border-[#2f4e44]/10"
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string;
  onRetry: () => void;
  t: ReturnType<typeof useTranslations<"player_stats">>;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <span className="material-icons text-[#f59e0b] text-2xl mb-2">
        error_outline
      </span>
      <p className="text-[10px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
        {t("errorTitle")}
      </p>
      <p className="text-[9px] font-space text-[#4a7a6a] mt-1 max-w-[240px]">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-1.5 rounded-lg bg-[#00251c] border border-[#2f4e44]/30 text-[10px] font-bold font-space tracking-widest uppercase text-[#a1ffc2] hover:bg-[#003329] transition-colors"
      >
        {t("retry")}
      </button>
    </div>
  );
}

export function PlayerSeasonStatsCard({
  playerId,
  refreshSignal = 0,
}: PlayerSeasonStatsCardProps) {
  const t = useTranslations("player_stats");
  const [data, setData] = useState<PlayerSeasonStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.players
      .getSeasonStats(playerId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message || t("networkError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // t is intentionally omitted: locale switches don\'t need a
    // re-fetch (the user-visible strings are derived from the
    // current dictionary on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, refreshSignal, retryTick]);

  const header = (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
      <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#a1ffc2]">
        {t("title")}
      </h3>
      {data && data.career.seasonsPlayed > 0 && (
        <span className="ml-auto text-[9px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
          {data.career.seasonsPlayed}{" "}
          {data.career.seasonsPlayed === 1
            ? t("seasonsPlayed")
            : t("seasonsPlayedPlural")}
        </span>
      )}
    </div>
  );

  return (
    <div className="bg-[#001e17] rounded-xl p-4 border border-[#2f4e44]/20 relative">
      <div className="absolute inset-0 bg-gradient-to-br from-[#a1ffc2]/3 to-transparent rounded-xl pointer-events-none" />
      <div className="relative">
        {header}

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => setRetryTick((x) => x + 1)}
            t={t}
          />
        ) : !data || data.career.seasonsPlayed === 0 ? (
          <EmptyState t={t} />
        ) : (
          <>
            {/* Career totals: mint=goals, sky=assists, lime=tackles,
                amber=appearances. Matches the rest of the player
                page\'s accent distribution. */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <KpiTile label={t("kpiGoals")} value={data.career.goals} accent="mint" />
              <KpiTile label={t("kpiAssists")} value={data.career.assists} accent="sky" />
              <KpiTile label={t("kpiTackles")} value={data.career.tackles} accent="lime" />
              <KpiTile label={t("kpiApps")} value={data.career.appearances} accent="amber" />
            </div>

            {/* Column header row. Same grid template as the data rows
                so the columns line up. Kept tight (8px) so it
                doesn\'t dominate the card visually. */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[8px] font-bold font-space tracking-widest uppercase text-[#4a7a6a]">
              <div className="col-span-2">{t("colSeason")}</div>
              <div className="col-span-3">{t("colComp")}</div>
              <div className="col-span-3">{t("colTeam")}</div>
              <div className="col-span-1 text-center">{t("colApp")}</div>
              <div className="col-span-1 text-center">{t("colG")}</div>
              <div className="col-span-1 text-center">{t("colA")}</div>
              <div className="col-span-1 text-center">{t("colSsub")}</div>
            </div>

            <div className="space-y-1.5">
              {data.seasons.map(
                (s: PlayerSeasonStats["seasons"][number], i: number) => (
                  <SeasonRow
                    key={`${s.season}-${s.leagueId ?? "null"}-${i}`}
                    row={s}
                    cupLabel={t("cupLabel")}
                  />
                ),
              )}
            </div>

            {/* Footer: one-line career rollup of the four numbers
                that aren\'t in the KPI strip \u2014 starts, sub
                appearances, yellow cards, red cards. */}
            <div className="mt-3 pt-3 border-t border-[#2f4e44]/15 flex items-center justify-between text-[9px] font-space text-[#91b2a6]">
              <span>
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.starts}
                </span>{" "}
                {t("startsLabel")}
              </span>
              <span>
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.substituteAppearances}
                </span>{" "}
                {t("asSubLabel")}
              </span>
              <span className="flex items-center gap-1">
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.yellowCards}
                </span>
                <span className="text-[#facc15]">{"⚫"}</span>
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.redCards}
                </span>
                <span className="text-[#ef4444]">{"⛕"}</span>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
