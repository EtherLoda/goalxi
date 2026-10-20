"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts/AuthContext";
import TransferHistoryPanel from "@/components/transfers/TransferHistoryPanel";
import TransferNav from "@/components/transfers/TransferNav";

export default function TransferHistoryPage() {
  const t = useTranslations("transfers");
  const { team } = useAuth();
  const params = useParams();
  const locale = (params.locale as string) ?? "zh";

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
          <p className="mt-1 font-label text-label text-on-surface-variant">{team?.name ?? ""}</p>
        </div>
        <TransferNav />
      </header>

      <TransferHistoryPanel team={team} locale={locale} />
    </div>
  );
}
