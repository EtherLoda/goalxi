"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { api, type TransferTransaction } from "@/lib/api";
import { Tooltip } from "@/components/ui/Tooltip";

interface TransferHistoryPanelProps {
  team: { id: string; name: string } | null;
  locale: string;
}

type Direction = "inbound" | "outbound";
type TypeFilter = "all" | Direction;

const PAGE_SIZE = 12;
// The API caps a page at 100; a club makes dozens of transfers per season, so
// one page per direction is the whole history in practice. Filtering and
// paging happen client-side so the summary numbers always describe the same
// set the table is drawn from.
const FETCH_LIMIT = 100;

export default function TransferHistoryPanel({ team, locale }: TransferHistoryPanelProps) {
  const t = useTranslations("transfers");
  const tc = useTranslations("common");
  const localeTag = useLocale();

  const [transactions, setTransactions] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [seasonFilter, setSeasonFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!team) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setFailed(false);
      try {
        const [purchases, sales] = await Promise.all([
          api.transfers.getMyPurchases({ page: 1, limit: FETCH_LIMIT }),
          api.transfers.getMySales({ page: 1, limit: FETCH_LIMIT }),
        ]);
        if (cancelled) return;
        const merged: TransferTransaction[] = [
          ...purchases.items.map((p) => ({ ...p, direction: "inbound" as const })),
          ...sales.items.map((s) => ({ ...s, direction: "outbound" as const })),
        ];
        merged.sort(
          (a, b) =>
            new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime(),
        );
        setTransactions(merged);
      } catch (err) {
        console.error("Failed to load transfer history", err);
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [team]);

  /** A transfer is inbound when the player landed on this club. The API's own
   *  "purchases" endpoint already implies that, but the merged list is sorted
   *  and filtered as one set, so derive it from the row instead of trusting the
   *  endpoint it came from. */
  const directionOf = (tx: TransferTransaction & { direction?: Direction }): Direction =>
    tx.direction ?? (tx.toTeam?.id === team?.id ? "inbound" : "outbound");

  const seasons = useMemo(
    () =>
      Array.from(new Set(transactions.map((tx) => tx.season).filter((s): s is number => !!s))).sort(
        (a, b) => b - a,
      ),
    [transactions],
  );

  const visible = useMemo(
    () =>
      transactions.filter((tx) => {
        if (typeFilter !== "all" && directionOf(tx) !== typeFilter) return false;
        if (seasonFilter !== "all" && tx.season !== seasonFilter) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions, typeFilter, seasonFilter, team?.id],
  );

  const summary = useMemo(() => {
    let inbound = 0;
    let outbound = 0;
    let spend = 0;
    let income = 0;
    for (const tx of visible) {
      if (directionOf(tx) === "inbound") {
        inbound += 1;
        spend += tx.amount ?? 0;
      } else {
        outbound += 1;
        income += tx.amount ?? 0;
      }
    }
    return { inbound, outbound, spend, income };
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [visible, team?.id]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const money = (value: number) =>
    `${tc("currencySymbol")}${Math.round(value).toLocaleString()}`;

  const formatDate = (value: string | Date | undefined) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString(localeTag, { day: "2-digit", month: "short", year: "numeric" });
  };

  const recentArrivals = transactions
    .filter((tx) => directionOf(tx) === "inbound")
    .slice(0, 2);

  const chip = (active: boolean, tone: "primary" | "danger" = "primary") =>
    [
      "rounded-full px-gutter py-tight font-label text-kicker font-bold uppercase tracking-[0.08em] transition-colors duration-quick",
      active
        ? tone === "danger"
          ? "bg-danger/15 text-danger"
          : "bg-primary/15 text-primary"
        : "text-on-surface-variant hover:text-on-surface",
    ].join(" ");

  const playerName = (tx: TransferTransaction) => tx.player?.name || t("history.unknownPlayer");

  return (
    <div className="flex flex-col gap-section">
      {/* Summary — describes exactly the rows the table below is drawn from. */}
      <div className="grid grid-cols-2 gap-tight md:grid-cols-4">
        <SummaryTile
          label={t("history.summaryInbound")}
          value={String(summary.inbound)}
          tone="primary"
        />
        <SummaryTile
          label={t("history.summaryOutbound")}
          value={String(summary.outbound)}
          tone="neutral"
        />
        <SummaryTile label={t("history.summarySpend")} value={money(summary.spend)} tone="neutral" />
        <SummaryTile
          label={t("history.summaryIncome")}
          value={money(summary.income)}
          tone="primary"
        />
      </div>

      {/* Recent arrivals */}
      {recentArrivals.length > 0 ? (
        <section className="flex flex-col gap-tight">
          <h2 className="font-label text-kicker uppercase tracking-[0.14em] text-outline">
            {t("history.recentArrivals")}
          </h2>
          <div className="grid grid-cols-1 gap-tight md:grid-cols-2">
            {recentArrivals.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-panel rounded-xl border border-outline-variant/30 bg-surface-container/60 p-panel"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] font-headline text-label font-black text-on-surface"
                  style={{ background: "linear-gradient(135deg, #00e47926, #00e4790a)" }}
                  aria-hidden="true"
                >
                  {initials(playerName(tx))}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-tight">
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-label text-kicker font-bold uppercase tracking-wider text-primary">
                      {t("history.signed")}
                    </span>
                    <span className="truncate font-headline text-body font-bold text-on-surface">
                      {playerName(tx)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-label text-kicker text-on-surface-variant">
                    {t("history.from", { team: tx.fromTeam?.name || t("history.unknown") })}
                    {" · "}
                    {formatDate(tx.transactionDate)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-headline text-body font-bold tabular-nums text-on-surface">
                    {money(tx.amount)}
                  </p>
                  <p className="font-label text-kicker text-outline">{t("history.transferFee")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Ledger */}
      <section className="flex flex-col gap-tight">
        <div className="flex flex-wrap items-center justify-between gap-tight">
          <h2 className="font-label text-kicker uppercase tracking-[0.14em] text-outline">
            {t("history.ledger")}
          </h2>
          <div className="flex flex-wrap items-center gap-micro">
            <div className="flex items-center gap-micro rounded-full border border-outline-variant/30 bg-surface-container/60 p-micro">
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("all");
                  setPage(1);
                }}
                className={chip(typeFilter === "all")}
              >
                {t("history.filterAll")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("inbound");
                  setPage(1);
                }}
                className={chip(typeFilter === "inbound")}
              >
                {t("history.inbound")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("outbound");
                  setPage(1);
                }}
                className={chip(typeFilter === "outbound", "danger")}
              >
                {t("history.outbound")}
              </button>
            </div>
            {seasons.length > 1 ? (
              <div className="flex items-center gap-micro rounded-full border border-outline-variant/30 bg-surface-container/60 p-micro">
                <button
                  type="button"
                  onClick={() => {
                    setSeasonFilter("all");
                    setPage(1);
                  }}
                  className={chip(seasonFilter === "all")}
                >
                  {t("history.allSeasons")}
                </button>
                {seasons.map((season) => (
                  <button
                    key={season}
                    type="button"
                    onClick={() => {
                      setSeasonFilter(season);
                      setPage(1);
                    }}
                    className={chip(seasonFilter === season)}
                  >
                    {t("history.seasonOption", { n: season })}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-container/40">
          {isLoading ? (
            <div className="flex flex-col gap-px">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 animate-pulse bg-surface-container/60" />
              ))}
            </div>
          ) : failed ? (
            <EmptyState icon="error" text={t("history.failedToLoad")} />
          ) : pageRows.length === 0 ? (
            <EmptyState icon="swap_horiz" text={t("history.empty")} />
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-container/60">
                  {[
                    t("history.tablePlayer"),
                    t("history.tableType"),
                    t("history.tableClub"),
                    t("history.tableFee"),
                    t("history.tableDate"),
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-panel py-tight font-label text-kicker font-bold uppercase tracking-[0.14em] text-outline"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((tx) => {
                  const inbound = directionOf(tx) === "inbound";
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-outline-variant/20 transition-colors duration-quick last:border-0 hover:bg-surface-container/60"
                    >
                      <td className="px-panel py-tight">
                        <div className="flex items-center gap-tight">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] font-headline text-kicker font-black text-on-surface"
                            aria-hidden="true"
                          >
                            {initials(playerName(tx))}
                          </span>
                          <span className="min-w-0">
                            <Link
                              href={`/${locale}/players/${tx.player?.id ?? ""}`}
                              className="block truncate font-body text-body font-bold text-on-surface transition-colors duration-quick hover:text-primary"
                            >
                              {playerName(tx)}
                            </Link>
                            <span className="block truncate font-label text-kicker text-on-surface-variant">
                              {tx.player?.age ? `${tx.player.age} · ` : ""}
                              {tx.season ? t("history.seasonOption", { n: tx.season }) : ""}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-panel py-tight">
                        <span
                          className={`inline-flex items-center rounded-full px-tight py-micro font-label text-kicker font-bold uppercase tracking-wider ${
                            inbound
                              ? "bg-primary/15 text-primary"
                              : "bg-danger/15 text-danger"
                          }`}
                        >
                          {inbound ? t("history.inbound") : t("history.outbound")}
                        </span>
                      </td>
                      <td className="px-panel py-tight">
                        <span className="block truncate font-body text-body text-on-surface-variant">
                          {inbound
                            ? tx.fromTeam?.name || t("history.unknown")
                            : tx.toTeam?.name || t("history.unknown")}
                        </span>
                      </td>
                      <td className="px-panel py-tight">
                        <span className="font-headline text-body font-bold tabular-nums text-on-surface">
                          {money(tx.amount)}
                        </span>
                      </td>
                      <td className="px-panel py-tight">
                        <Tooltip label={t("history.completed")}>
                          <span className="font-label text-label text-on-surface-variant">
                            {formatDate(tx.transactionDate)}
                          </span>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!isLoading && !failed && totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-outline-variant/30 px-panel py-tight">
              <span className="font-label text-kicker text-on-surface-variant">
                {t("history.showing", {
                  count: visible.length,
                  page: currentPage,
                  total: totalPages,
                })}
              </span>
              <div className="flex items-center gap-micro">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-md px-tight py-micro font-label text-kicker font-bold uppercase tracking-wider text-on-surface-variant transition-colors duration-quick hover:text-on-surface disabled:opacity-30"
                >
                  {t("history.prev")}
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-md px-tight py-micro font-label text-kicker font-bold uppercase tracking-wider text-on-surface-variant transition-colors duration-quick hover:text-on-surface disabled:opacity-30"
                >
                  {t("history.next")}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "neutral";
}) {
  return (
    <div className="flex flex-col gap-micro rounded-xl border border-outline-variant/30 bg-surface-container/40 px-panel py-tight">
      <span className="font-label text-kicker uppercase tracking-[0.14em] text-outline">
        {label}
      </span>
      <span
        className={`font-headline text-lg font-bold tabular-nums ${
          tone === "primary" ? "text-primary" : "text-on-surface"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: "error" | "swap_horiz"; text: string }) {
  return (
    <div className="flex items-center justify-center gap-tight px-panel py-section">
      <AppIcon name={icon} className="text-body text-outline" />
      <span className="font-label text-label text-on-surface-variant">{text}</span>
    </div>
  );
}
