"use client";

/**
 * Per-player competition-stats card.
 *
 * Renders career totals + every (league, season) row from
 * `GET /stats/player/:id/seasons`. Goals / assists / tackles /
 * yellow / red cards / appearances are surfaced in two layers:
 *
 *  1. Career totals strip — four big-number KPI tiles so a
 *     visitor can read a player's full contribution at a glance.
 *  2. Per-season table — one row per (league, season) the player
 *     has recorded. Cup / youth rows have null leagueId and are
 *     labelled "Cup" (the FE consumer can rename to "Youth" if
 *     the project enables youth leagues).
 *
 * Visual language follows the rest of GoalXI: dark slate cards
 * (`bg-[#001e17] / border-[#2f4e44]/20`), mint primary text
 * (`#a1ffc2`), and the same 1.5x4 colored-bar + uppercase
 * tracking-widest label pattern used in the skill section.
 *
 * The component fetches on mount + whenever `playerId` changes,
 * and re-fetches when the parent's `refreshSignal` ticks (e.g.
 * after a match completes if the parent is wired to a live
 * event). The Retry button on errors bumps an internal counter
 * that re-runs the same effect.
 */

import { useEffect, useState } from "react";
import { api, type PlayerSeasonStats } from "@/lib/api";

export interface PlayerSeasonStatsCardProps {
  playerId: number;
  locale?: string;
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
  /** Mint / lime / amber / sky; matches the GoalXI section accents. */
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

/** "12 (3)" for "12 starts of which 3 were as sub" in compact
 *  form — the FE column budget is tight. */
function startsWithSub(starts: number, subs: number): string {
  if (subs === 0) return String(starts);
  return `${starts} (${subs})`;
}

function SeasonRow({
  row,
  locale,
}: {
  row: PlayerSeasonStats["seasons"][number];
  locale: string;
}) {
  const isZh = locale === "zh";
  // Cup / youth rows come from match.leagueId = null. We can't
  // tell them apart from the row alone, so label them as "Cup"
  // (a project's youth structure usually has its own page; if
  // the project enables youth leagues, this label can be
  // extended by the FE consumer before render).
  const competitionLabel = row.leagueName ?? (isZh ? "杯赛" : "Cup");
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

function EmptyState({ isZh }: { isZh: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <div className="w-10 h-10 rounded-full bg-[#00251c] border border-[#2f4e44]/20 flex items-center justify-center mb-2">
        <span className="material-icons text-[#91b2a6] text-lg">sports_soccer</span>
      </div>
      <p className="text-[10px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
        {isZh ? "暂无数据" : "No stats yet"}
      </p>
      <p className="text-[9px] font-space text-[#4a7a6a] mt-1 max-w-[240px]">
        {isZh
          ? "球员完成比赛后，这里会显示进球、助攻等累计数据。"
          : "Stats will appear after the player completes a match."}
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
  isZh,
}: {
  message: string;
  onRetry: () => void;
  isZh: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <span className="material-icons text-[#f59e0b] text-2xl mb-2">
        error_outline
      </span>
      <p className="text-[10px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
        {isZh ? "加载失败" : "Couldn\'t load stats"}
      </p>
      <p className="text-[9px] font-space text-[#4a7a6a] mt-1 max-w-[240px]">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="mt-3 px-3 py-1.5 rounded-lg bg-[#00251c] border border-[#2f4e44]/30 text-[10px] font-bold font-space tracking-widest uppercase text-[#a1ffc2] hover:bg-[#003329] transition-colors"
      >
        {isZh ? "重试" : "Retry"}
      </button>
    </div>
  );
}

export function PlayerSeasonStatsCard({
  playerId,
  locale = "en",
  refreshSignal = 0,
}: PlayerSeasonStatsCardProps) {
  const isZh = locale === "zh";
  const [data, setData] = useState<PlayerSeasonStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryTick, setRetryTick] = useState(0);

  // Re-fetch on playerId change OR refreshSignal bump OR retry
  // button press. isZh is NOT in the deps — a language switch
  // doesn\'t re-fetch the payload, the labels flip locally.
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
        setError(
          err.message || (isZh ? "网络错误" : "Network error"),
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, refreshSignal, retryTick]);

  const header = (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-1.5 h-4 bg-[#a1ffc2] rounded-full" />
      <h3 className="text-xs font-black font-space tracking-widest uppercase text-[#a1ffc2]">
        {isZh
          ? "数据 · 赛季表现"
          : "STATS · SEASONAL PERFORMANCE"}
      </h3>
      {data && data.career.seasonsPlayed > 0 && (
        <span className="ml-auto text-[9px] font-bold font-space tracking-widest uppercase text-[#91b2a6]">
          {data.career.seasonsPlayed}{" "}
          {isZh
            ? "个赛季"
            : `season${data.career.seasonsPlayed === 1 ? "" : "s"}`}
        </span>
      )}
    </div>
  );

  return (
    <div className="bg-[#001e17] rounded-xl p-4 border border-[#2f4e44]/20 relative">
      {/* Subtle glass overlay so the card sits on the same plane
          as the Skills card above it. Mirrors the existing
          gradient accents used elsewhere in the player page. */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#a1ffc2]/3 to-transparent rounded-xl pointer-events-none" />
      <div className="relative">
        {header}

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState
            message={error}
            onRetry={() => setRetryTick((t) => t + 1)}
            isZh={isZh}
          />
        ) : !data || data.career.seasonsPlayed === 0 ? (
          <EmptyState isZh={isZh} />
        ) : (
          <>
            {/* Career totals: mint=goals, sky=assists, lime=tackles,
                amber=appearances. Matches the rest of the player
                page\'s accent distribution. */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <KpiTile
                label={isZh ? "进球" : "GOALS"}
                value={data.career.goals}
                accent="mint"
              />
              <KpiTile
                label={isZh ? "助攻" : "ASSISTS"}
                value={data.career.assists}
                accent="sky"
              />
              <KpiTile
                label={isZh ? "抢断" : "TACKLES"}
                value={data.career.tackles}
                accent="lime"
              />
              <KpiTile
                label={isZh ? "出场" : "APPS"}
                value={data.career.appearances}
                accent="amber"
              />
            </div>

            {/* Column header row. Same grid template as the data
                rows so the columns line up. Kept tight (8px) so
                it doesn\'t dominate the card visually. */}
            <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[8px] font-bold font-space tracking-widest uppercase text-[#4a7a6a]">
              <div className="col-span-2">{isZh ? "赛季" : "SEASON"}</div>
              <div className="col-span-3">{isZh ? "赛事" : "COMP"}</div>
              <div className="col-span-3">{isZh ? "球队" : "TEAM"}</div>
              <div className="col-span-1 text-center">
                {isZh ? "出场" : "APP"}
              </div>
              <div className="col-span-1 text-center">{isZh ? "进球" : "G"}</div>
              <div className="col-span-1 text-center">{isZh ? "助攻" : "A"}</div>
              <div className="col-span-1 text-center">
                {isZh ? "首发(替)" : "S(SUB)"}
              </div>
            </div>

            <div className="space-y-1.5">
              {data.seasons.map((s: PlayerSeasonStats["seasons"][number], i: number) => (
                <SeasonRow
                  key={`${s.season}-${s.leagueId ?? "null"}-${i}`}
                  row={s}
                  locale={locale}
                />
              ))}
            </div>

            {/* Footer: one-line career rollup of the four
                numbers that aren\'t in the KPI strip — starts,
                sub appearances, yellow cards, red cards. */}
            <div className="mt-3 pt-3 border-t border-[#2f4e44]/15 flex items-center justify-between text-[9px] font-space text-[#91b2a6]">
              <span>
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.starts}
                </span>{" "}
                {isZh ? "首发" : "starts"}
              </span>
              <span>
                <span className="font-bold text-[#d3f5e8]">
                  {data.career.substituteAppearances}
                </span>{" "}
                {isZh ? "替补" : "as sub"}
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
