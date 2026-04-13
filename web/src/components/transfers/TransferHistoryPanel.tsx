"use client";

import { useEffect, useState } from "react";
import { api, type TransferTransaction } from "@/lib/api";

interface TransferHistoryPanelProps {
  team: { id: string; name: string } | null;
  initialTransactions?: TransferTransaction[];
}

export default function TransferHistoryPanel({ team, initialTransactions }: TransferHistoryPanelProps) {
  const [transactions, setTransactions] = useState<TransferTransaction[]>(initialTransactions || []);
  const [isLoading, setIsLoading] = useState(!initialTransactions);
  const [typeFilter, setTypeFilter] = useState<"all" | "inbound" | "outbound">("all");

  useEffect(() => {
    if (!team || initialTransactions) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const [purchases, sales] = await Promise.all([
          api.transfers.getMyPurchases(),
          api.transfers.getMySales(),
        ]);
        const all = [...purchases, ...sales].sort(
          (a, b) =>
            new Date(b.transactionDate).getTime() -
            new Date(a.transactionDate).getTime(),
        );
        setTransactions(all);
      } catch (err) {
        console.error("Failed to fetch history:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [team, initialTransactions]);

  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter === "all") return true;
    if (typeFilter === "inbound") return tx.toTeam?.id === team?.id;
    if (typeFilter === "outbound") return tx.fromTeam?.id === team?.id;
    return true;
  });

  const formatCurrency = (value: number) => {
    return `€${value.toLocaleString()}`;
  };

  const formatDate = (dateStr: string | Date | undefined) => {
    if (!dateStr) return "—";
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return "—";
      return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  // Recent arrivals = purchases (inbound)
  const recentArrivals = transactions.filter((tx) => tx.toTeam?.id === team?.id).slice(0, 2);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Recent Arrivals Section */}
      {recentArrivals.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs uppercase tracking-[0.3em] text-[#91b2a6] font-bold">
              Recent Arrivals
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {recentArrivals.map((tx) => (
              <div
                key={tx.id}
                className="group relative rounded-2xl overflow-hidden glass-card h-40 flex items-center cursor-pointer hover:bg-[#002c22] transition-colors"
              >
                <div className="p-8 relative z-20 w-full flex justify-between items-center">
                  <div>
                    <span className="px-2 py-1 bg-[#a1ffc2] text-[#00643a] text-[9px] font-black uppercase tracking-tighter rounded-sm">
                      SIGNED
                    </span>
                    <h4 className="text-2xl font-headline font-bold text-[#d3f5e8] mt-2 group-hover:text-[#a1ffc2] transition-colors">
                      {tx.player?.name || "Unknown Player"}
                    </h4>
                    <p className="text-xs text-[#91b2a6] font-medium">
                      From {tx.fromTeam?.name?.toUpperCase() || "UNKNOWN"}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-headline font-bold text-[#a1ffc2]">
                      {formatCurrency(tx.amount)}
                    </div>
                    <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                      Transfer Fee
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
          <h3 className="text-xs uppercase tracking-[0.3em] text-[#91b2a6] font-bold">
            Transaction Log
          </h3>
          <div className="flex items-center gap-2 bg-[#00251c] p-1.5 rounded-full">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "all"
                  ? "bg-[#a1ffc2] text-[#00643a]"
                  : "text-[#91b2a6] hover:text-[#d3f5e8]"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter("inbound")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "inbound"
                  ? "bg-[#a1ffc2] text-[#00643a]"
                  : "text-[#91b2a6] hover:text-[#d3f5e8]"
              }`}
            >
              Inbound
            </button>
            <button
              onClick={() => setTypeFilter("outbound")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                typeFilter === "outbound"
                  ? "bg-[#ff716c] text-[#490006]"
                  : "text-[#91b2a6] hover:text-[#d3f5e8]"
              }`}
            >
              Outbound
            </button>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden glass-card">
          {isLoading ? (
            <div className="p-8 text-center text-[#91b2a6]">Loading...</div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-[#91b2a6]">
              No transactions found.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#00251c]">
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Date
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Player
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Type
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Club
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Fee
                  </th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#91b2a6]">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f4e44]/10">
                {filteredTransactions.map((tx) => {
                  const isInbound = tx.toTeam?.id === team?.id;
                  return (
                    <tr
                      key={tx.id}
                      className="hover:bg-[#001e17] transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <p className="text-xs font-medium text-[#d3f5e8]">
                          {tx.transactionDate ? formatDate(tx.transactionDate) : "—"}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#002c22] border border-[#a1ffc2]/20 overflow-hidden flex items-center justify-center">
                            <span className="text-sm font-bold text-[#a1ffc2]">
                              {tx.player?.name?.charAt(0) || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#d3f5e8]">
                              {tx.player?.name || "Unknown Player"}
                            </p>
                            <p className="text-[10px] text-[#91b2a6]">
                              Age: {tx.player?.age || "?"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-widest ${
                            isInbound
                              ? "text-[#a1ffc2]"
                              : "text-[#ff716c]"
                          }`}
                        >
                          {isInbound ? "Inbound" : "Outbound"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-[#91b2a6] text-lg">
                            shield
                          </span>
                          <p className="text-xs text-[#91b2a6] font-medium">
                            {isInbound
                              ? tx.fromTeam?.name?.toUpperCase() ||
                                "UNKNOWN"
                              : tx.toTeam?.name?.toUpperCase() || "UNKNOWN"}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-headline font-bold text-[#d3f5e8]">
                          {formatCurrency(tx.amount)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#00fc9a]"></div>
                          <span className="text-[10px] font-bold text-[#d3f5e8] uppercase tracking-widest">
                            Completed
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
