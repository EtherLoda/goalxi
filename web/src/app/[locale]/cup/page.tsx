"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { cupApi, type CupRef } from "@/lib/cup-api";
import CupList from "@/components/cup/CupList";

export default function CupIndexPage() {
  const t = useTranslations("cup");
  const params = useParams<{ locale: string }>();
  const locale = (params?.locale as "en" | "zh") || "en";
  const [cups, setCups] = useState<CupRef[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    cupApi
      .listCups()
      .then((data) => {
        if (!cancelled) setCups(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? t("loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-accent text-3xl">
            emoji_events
          </span>
          <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-frost">
            {t("list.title")}
          </h1>
        </div>
        <p className="font-body text-sm text-on-surface-variant max-w-2xl">
          {t("subtitle")}
        </p>
      </div>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-danger/30 bg-danger/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        </div>
      )}

      {!cups && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block animate-pulse">
            hourglass_empty
          </span>
          <p className="font-headline text-on-surface-variant">{t("loading")}</p>
        </div>
      )}

      {cups && <CupList cups={cups} locale={locale} />}
    </div>
  );
}
