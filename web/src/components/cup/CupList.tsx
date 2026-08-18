"use client";

import { useTranslations } from "next-intl";
import type { CupRef } from "@/lib/cup-api";
import CupCard from "./CupCard";

interface CupListProps {
  cups: CupRef[];
  locale: string;
}

/**
 * The /cup index page list. The MVP has at most one cup per
 * season, so this rarely renders more than 1-2 cards. Future
 * cups (Senior Trophy, League Vase) would show up here too.
 */
export default function CupList({ cups, locale }: CupListProps) {
  const t = useTranslations("cup");
  if (cups.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block">
          emoji_events
        </span>
        <p className="font-headline text-on-surface-variant">{t("list.empty")}</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cups.map((c) => (
        <CupCard key={c.id} cup={c} locale={locale} />
      ))}
    </div>
  );
}
