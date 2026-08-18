"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { CupRef } from "@/lib/cup-api";

interface CupCardProps {
  cup: CupRef;
  locale: string;
  totalRounds?: number;
}

export default function CupCard({ cup, locale, totalRounds }: CupCardProps) {
  const t = useTranslations("cup");
  const statusCls =
    cup.status === "completed"
      ? "bg-primary/10 text-primary border-primary/30"
      : cup.status === "in_progress"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : "bg-surface-container/50 text-on-surface-variant border-outline-variant/20";
  return (
    <Link
      href={`/${locale}/cup/${cup.id}`}
      className="glass-panel p-5 rounded-2xl border border-outline-variant/10 hover:border-primary/30 transition-all block"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-label text-[10px] font-black uppercase tracking-[0.15em] text-on-surface-variant/60 mb-1">
            Season {cup.season} · {cup.type}
          </div>
          <h3 className="font-headline font-black text-lg text-[#d3f5e8] truncate">
            {cup.name}
          </h3>
        </div>
        <span
          className={
            "shrink-0 font-label text-[10px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded border " +
            statusCls
          }
        >
          {t("status." + cup.status)}
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between font-body text-xs text-on-surface-variant">
        <span>
          {t("list.rounds", { count: totalRounds ?? "—" })}
        </span>
        <span>
          {cup.prizeCurrency} {cup.prizePool.toLocaleString()}
        </span>
      </div>
    </Link>
  );
}
