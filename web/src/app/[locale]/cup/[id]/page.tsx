"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cupApi, type CupRef } from "@/lib/cup-api";
import CupBracket from "@/components/cup/CupBracket";

export default function CupDetailPage() {
  const t = useTranslations("cup");
  const params = useParams<{ locale: string; id: string }>();
  const cupId = params?.id as string;
  const [cup, setCup] = useState<CupRef | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cupId) return;
    let cancelled = false;
    cupApi
      .getCup(cupId)
      .then((data) => {
        if (!cancelled) setCup(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? t("loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [cupId, t]);

  if (error) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="glass-panel p-4 rounded-2xl border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant/60 mb-1">
            {t("title")}
          </div>
          <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-[#d3f5e8]">
            {cup?.name ?? "—"}
          </h1>
          {cup && (
            <div className="mt-2 flex items-center gap-3 font-body text-xs text-on-surface-variant">
              <span>
                Season {cup.season} · {cup.type}
              </span>
              <span>·</span>
              <span>{t("status." + cup.status)}</span>
            </div>
          )}
        </div>
        {cup?.status === "completed" && (
          <ChampionBanner cup={cup} />
        )}
      </div>

      <CupBracket cupId={cupId} />
    </div>
  );
}

function ChampionBanner({ cup }: { cup: CupRef }) {
  const t = useTranslations("cup.champion");
  return (
    <div className="glass-panel px-5 py-4 rounded-2xl border border-primary/30 bg-primary/5">
      <div className="font-label text-[10px] font-black uppercase tracking-[0.2em] text-primary/80 mb-1">
        {t("title")}
      </div>
      <div className="font-headline font-black text-lg text-[#d3f5e8]">
        {t("subtitle", { season: cup.season })}
      </div>
    </div>
  );
}
