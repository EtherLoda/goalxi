"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import type { LeagueTeamStatusBoard } from "@/lib/api";
import { useGameStore } from "@/stores/gameStore";
import { dashboardTeamHref } from "@/lib/team-view";

interface TeamStatusTableProps {
  board: LeagueTeamStatusBoard | null;
  userTeamId?: string;
  locale?: string;
}

/**
 * One row per club in rank order, five counters per row.
 *
 * The board is deliberately the same shape as the standings table: same rank
 * order, same club cell, same row height. It reads as "the standings, plus
 * what the squads look like", so a manager who has just scanned the table can
 * look at one club and see both.
 *
 * Zeroes render as a dash rather than a 0. A table of sixteen rows is mostly
 * absence most weeks, and sixteen zeroes read as data while sixteen dashes
 * read as "nothing happened here" — which is the truth, and it lets the
 * handful of real numbers stand out.
 */
export default function TeamStatusTable({
  board,
  userTeamId,
  locale = "en",
}: TeamStatusTableProps) {
  const t = useTranslations("league.status");
  const router = useRouter();
  const { viewTeamId, setViewTeam } = useGameStore();

  const handleTeamClick = (teamId: string) => {
    setViewTeam(teamId === userTeamId ? userTeamId : teamId);
    router.push(dashboardTeamHref(locale, teamId));
  };

  const rows = board?.items ?? [];

  return (
    <div className="glass-panel rounded-2xl overflow-hidden flex flex-col">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h3 className="font-headline text-sm font-black tracking-tight text-on-surface">
            {t("title")}
          </h3>
          {/* The window is printed from the payload, not hard-coded: the
              server owns the number and the label has to match it. */}
          {board && board.transferWindowDays > 0 && (
            <span className="font-label text-kicker font-black uppercase tracking-[0.16em] text-on-surface-variant">
              {t("window", { days: board.transferWindowDays })}
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 pb-5 font-body text-xs text-on-surface-variant">
          {t("empty")}
        </p>
      ) : (
        <div className="overflow-y-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className="font-label text-kicker font-black uppercase tracking-[0.16em] text-on-surface-variant/70 border-b border-white/5 bg-surface-container/80 backdrop-blur-md">
                <th className="pb-2 pl-4 pr-1 w-12">#</th>
                <th className="pb-2 pr-3">{t("club")}</th>
                <th className="pb-2 text-center w-9">{t("redCards")}</th>
                <th className="pb-2 text-center w-9">{t("injured")}</th>
                <th className="pb-2 text-center w-9">{t("listed")}</th>
                <th className="pb-2 text-center w-9">{t("joined")}</th>
                <th className="pb-2 pr-4 text-center w-10">{t("left")}</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {rows.map((row) => {
                const isUserTeam = row.teamId === userTeamId;
                const isViewingTeam = viewTeamId
                  ? viewTeamId === row.teamId
                  : isUserTeam;

                return (
                  <tr
                    key={row.teamId}
                    className={clsx(
                      "border-b border-white/5 transition-colors",
                      isViewingTeam && "bg-primary/10",
                      isUserTeam && !isViewingTeam && "bg-primary/5",
                    )}
                  >
                    <td className="py-2 pl-4 pr-1">
                      <span className="inline-flex h-6 w-6 items-center justify-center font-headline text-xs font-black tabular-nums text-on-surface-variant/70">
                        {row.position}
                      </span>
                    </td>

                    <td className="py-2 pr-3">
                      <span
                        onClick={() => handleTeamClick(row.teamId)}
                        className={clsx(
                          "font-bold cursor-pointer hover:text-primary transition-colors truncate block",
                          isViewingTeam
                            ? "text-primary"
                            : isUserTeam
                              ? "text-primary/80"
                              : "text-on-surface",
                        )}
                      >
                        {row.teamName}
                      </span>
                    </td>

                    <CountCell value={row.redCards} tone="error" />
                    <CountCell value={row.injured} tone="warn" />
                    <CountCell value={row.listed} tone="plain" />
                    <CountCell value={row.joined} tone="primary" />
                    <CountCell value={row.left} tone="muted" lastCell />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * A single counter cell.
 *
 * `tone` only ever colours a NON-zero value, so an empty week leaves the row
 * neutral instead of painting five coloured dashes.
 */
function CountCell({
  value,
  tone,
  lastCell = false,
}: {
  value: number;
  tone: "error" | "warn" | "primary" | "plain" | "muted";
  lastCell?: boolean;
}) {
  const toneClass =
    tone === "error"
      ? "text-error"
      : tone === "warn"
        ? "text-signal-gold"
        : tone === "primary"
          ? "text-primary"
          : tone === "muted"
            ? "text-on-surface-variant"
            : "text-on-surface";

  return (
    <td className={clsx("py-2 text-center", lastCell && "pr-4")}>
      {value > 0 ? (
        <span
          className={clsx(
            "font-headline text-xs font-black tabular-nums",
            toneClass,
          )}
        >
          {value}
        </span>
      ) : (
        <span className="font-headline text-xs tabular-nums text-outline/40">
          —
        </span>
      )}
    </td>
  );
}
