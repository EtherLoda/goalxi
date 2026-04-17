"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api, type TransferTransaction } from "@/lib/api";
import TransferHistoryPanel from "@/components/transfers/TransferHistoryPanel";

export default function TransferHistoryPage() {
  const { team } = useAuth();
  const [transactions, setTransactions] = useState<TransferTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!team) return;

    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const [purchasesResult, salesResult] = await Promise.all([
          api.transfers.getMyPurchases({ season: undefined, page: 1, limit: 100 }),
          api.transfers.getMySales({ season: undefined, page: 1, limit: 100 }),
        ]);

        // Combine purchases and sales into transactions
        const allTransactions: TransferTransaction[] = [
          ...purchasesResult.items.map((p) => ({
            ...p,
            direction: "inbound" as const,
          })),
          ...salesResult.items.map((s) => ({
            ...s,
            direction: "outbound" as const,
          })),
        ];

        // Sort by date descending
        allTransactions.sort(
          (a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
        );

        setTransactions(allTransactions);
      } catch (error) {
        console.error("Failed to fetch transfer history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchHistory();
  }, [team]);

  return (
    <div className="p-6">
      <TransferHistoryPanel team={team} initialTransactions={transactions} />
    </div>
  );
}
