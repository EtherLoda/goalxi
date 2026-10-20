"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import { api, type TransferTransaction } from "@/lib/api";
import TransferHistoryPanel from "@/components/transfers/TransferHistoryPanel";
import TransferNav from "@/components/transfers/TransferNav";

export default function TransferHistoryPage() {
  const t = useTranslations("transfers");
  const { team } = useAuth();
  const [transactions, setTransactions] = useState<TransferTransaction[]>([]);

  useEffect(() => {
    if (!team) return;

    const fetchHistory = async () => {
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
      }
    };

    fetchHistory();
  }, [team]);

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6">
      <header className="mb-gutter flex flex-wrap items-end justify-between gap-tight">
        <div className="min-w-0">
          <p className="font-label text-kicker font-bold uppercase tracking-[0.14em] text-primary">
            {t("title")}
          </p>
          <h1 className="mt-1 font-headline text-2xl font-black tracking-tight text-on-surface">
            {t("nav.history")}
          </h1>
          <p className="mt-1 font-label text-label text-on-surface-variant">
            {team?.name ?? ""}
          </p>
        </div>
        <TransferNav />
      </header>

      <TransferHistoryPanel team={team} initialTransactions={transactions} />
    </div>
  );
}
