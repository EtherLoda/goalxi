"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { api, type TransferTransaction } from "@/lib/api";

interface TransferHistoryPanelProps {
  team: { id: string; name: string } | null;
  initialTransactions?: TransferTransaction[];
}

interface PaginatedResponse<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export default function TransferHistoryPanel({ team, initialTransactions }: TransferHistoryPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [transactions, setTransactions] = useState<TransferTransaction[]>(initialTransactions || []);
  const [isLoading, setIsLoading] = useState(!initialTransactions);
  const [typeFilter, setTypeFilter] = useState<"all" | "inbound" | "outbound">("all");
  const [seasonFilter, setSeasonFilter] = useState<number | "all">("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // Get available seasons from transactions
  const availableSeasons = Array.from(
    new Set(transactions.map((tx) => tx.season).filter(Boolean))
  ).sort((a, b) => b - a);

  useEffect(() => {
    if (!team || (initialTransactions && initialTransactions.length > 0)) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const query: { season?: number; page?: number; limit?: number } = {
          limit,
          page: seasonFilter !== "all" ? 1 : page,
        };
        if (seasonFilter !== "all") {
          query.season = seasonFilter;
        }
        const [purchasesResult, salesResult] = await Promise.all([
          api.transfers.getMyPurchases(query),
          api.transfers.getMySales(query),
        ]);
        const allPurchases = purchasesResult.items;
        const allSales = salesResult.items;
        const all = [...allPurchases, ...allSales].sort(
          (a, b) =>
            new Date(b.transactionDate).getTime() -
            new Date(a.transactionDate).getTime(),
        );
        setTransactions(all);
        // Use the larger totalPages between purchases and sales
        const maxTotal = Math.max(purchasesResult.meta.total, salesResult.meta.total);
        setTotal(maxTotal);
        setTotalPages(Math.ceil(maxTotal / limit));
      } catch (err) {
        console.error(t("shortlist.history.failedToLoad"), err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [team, initialTransactions, seasonFilter, page, t]);

  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter === "inbound" && tx.toTeam?.id !== team?.id) return false;
    if (typeFilter === "outbound" && tx.fromTeam?.id !== team?.id) return false;
    if (seasonFilter !== "all" && tx.season !== seasonFilter) return false;
    return true;
  });

  const formatCurrency = (value: number) => {
    return `${t("common.currencySymbol")}${value.toLocaleString()}`;
  };

  const formatDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const paginationControls = totalPages > 1 ? (
    <div className="flex items-center justify-between px-6 py-4 border-t border-edge/10">
      <span className="text-xs text-muted">
        {t("shortlist.history.showing", { count: transactions.length, total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-ink-700 text-frost hover:bg-ink-500"
        >
          {t("shortlist.history.prev")}
        </button>
        <span className="text-xs text-frost font-medium">
          {t("shortlist.history.page", { page, total: totalPages })}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
          className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-ink-700 text-frost hover:bg-ink-500"
        >
          {t("shortlist.history.next")}
        </button>
      </div>
    </div>
  ) : null;

  // Recent arrivals = purchases (inbound)
  const recentArrivals = transactions.filter((tx) => tx.toTeam?.id === team?.id).slice(0, 2);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Recent Arrivals Section */}
      {recentArrivals.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs uppercase tracking-[0.3em] text-muted font-bold">
              {t("shortlist.history.recentArrivals")}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentArrivals.map((tx) => (
              <div
                key={tx.id}
                className="group relative rounded-2xl overflow-hidden glass-card h-40 flex items-center cursor-pointer hover:bg-ink-600 transition-colors"
              >
                <div className="p-8 relative z-20 w-full flex justify-between items-center">
                  <div>
                    <span className="px-2 py-1 bg-accent text-inverse-primary text-[9px] font-black uppercase tracking-tighter rounded-sm">
                      {t("shortlist.history.signed")}
                    </span>
                    <h4 className="text-2xl font-headline font-bold text-frost mt-2 group-hover:text-accent transition-colors">
                      {tx.player?.name || t("shortlist.history.unknownPlayer")}
                    </h4>
                    <p className="text-xs text-muted font-medium">
                      {t("shortlist.history.from", { team: tx.fromTeam?.name?.toUpperCase() || t("shortlist.history.unknown") })}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-headline font-bold text-accent">
                      {formatCurrency(tx.amount)}
                    </div>
                    <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                      {t("shortlist.history.transferFee")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction Log */}
      <section className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
          <h3 className="text-xs uppercase tracking-[0.3em] text-muted font-bold">
            {t("shortlist.history.transactionLog")}
          </h3>
          <div className="flex items-center gap-2 bg-ink-700 p-1.5 rounded-full">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "all"
                  ? "bg-accent text-inverse-primary"
                  : "text-muted hover:text-frost"
              }`}
            >
              {t("shortlist.history.filterAll")}
            </button>
            <button
              onClick={() => setTypeFilter("inbound")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "inbound"
                  ? "bg-accent text-inverse-primary"
                  : "text-muted hover:text-frost"
              }`}
            >
              {t("shortlist.history.filterInbound")}
            </button>
            <button
              onClick={() => setTypeFilter("outbound")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "outbound"
                  ? "bg-danger-soft text-on-danger-soft"
                  : "text-muted hover:text-frost"
              }`}
            >
              {t("shortlist.history.filterOutbound")}
            </button>
          </div>
          {availableSeasons.length > 0 && (
            <div className="relative">
              <select
                value={seasonFilter}
                onChange={(e) => { setSeasonFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setPage(1); }}
                className="appearance-none bg-ink-600 border border-edge/30 rounded-xl px-4 py-2.5 pr-10 text-xs font-bold text-frost cursor-pointer hover:border-accent/30 transition-colors focus:outline-none focus:border-accent/50 shadow-lg"
              >
                <option value="all">{t("shortlist.history.allSeasons")}</option>
                {availableSeasons.map((s) => (
                  <option key={s} value={s}>{t("shortlist.history.seasonOption", { n: s })}</option>
                ))}
              </select>
              <AppIcon name="expand_more" className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none" />
            </div>
          )}
        </div>

        <div className="rounded-2xl overflow-hidden glass-card">
          {isLoading ? (
            <div className="p-8 text-center text-muted">{t("shortlist.history.loading")}</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-muted">
              {t("shortlist.history.noTransactions")}
            </div>
          ) : (
            <>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-ink-700">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableSeason")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableDate")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tablePlayer")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableType")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableClub")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableFee")}
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-muted">
                    {t("shortlist.history.tableStatus")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/10">
                {filteredTransactions.map((tx) => {
                  const isInbound = tx.toTeam?.id === team?.id;
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-ink-800 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="text-[10px] font-bold text-muted">
                          {t("shortlist.season", { season: tx.season })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-xs font-medium text-frost">
                          {tx.transactionDate ? formatDate(tx.transactionDate) : "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-ink-600 border border-accent/20 overflow-hidden flex items-center justify-center">
                            <span className="text-sm font-bold text-accent">
                              {tx.player?.name?.charAt(0) || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-frost">
                              {tx.player?.name || t("shortlist.history.unknownPlayer")}
                            </p>
                            <p className="text-[10px] text-muted">
                              {t("shortlist.history.age", { age: tx.player?.age || "?" })}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest ${
                            isInbound
                              ? "text-accent"
                              : "text-danger-soft"
                          }`}
                        >
                          {isInbound ? t("shortlist.history.inbound") : t("shortlist.history.outbound")}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <AppIcon name="shield" className="text-muted text-lg" />
                          <p className="text-xs text-muted font-medium">
                            {isInbound
                              ? tx.fromTeam?.name?.toUpperCase() ||
                                t("shortlist.history.unknown")
                              : tx.toTeam?.name?.toUpperCase() || t("shortlist.history.unknown")}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-headline font-bold text-frost">
                          {formatCurrency(tx.amount)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-jade"></div>
                          <span className="text-[10px] font-bold text-frost uppercase tracking-widest">
                            {t("shortlist.history.completed")}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {paginationControls}
            </>
          )}
        </div>
      </section>

      <style jsx>{`
        .glass-card {
          background: rgba(0, 44, 34, 0.6);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(161, 255, 194, 0.05);
        }
      `}</style>
    </div>
  );
}
