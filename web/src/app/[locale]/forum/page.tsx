"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { forumApi, ForumCategory } from "@/lib/forum-api";
import CategoryList from "@/components/forum/CategoryList";

export default function ForumIndexPage() {
  const t = useTranslations("forum");
  const [categories, setCategories] = useState<ForumCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    forumApi
      .listCategories()
      .then((data) => {
        if (!cancelled) setCategories(data);
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
          <AppIcon name="forum" className="text-accent text-3xl" />
          <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-frost">
            {t("title")}
          </h1>
        </div>
        <p className="font-body text-sm text-on-surface-variant max-w-2xl">
          {t("subtitle")}
        </p>
      </div>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-danger/30 bg-danger/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <AppIcon name="error" />
            {error}
          </div>
        </div>
      )}

      {!categories && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <AppIcon name="hourglass_empty" className="text-4xl text-on-surface-variant/40 mb-3 block animate-pulse" />
          <p className="font-headline text-on-surface-variant">{t("loading")}</p>
        </div>
      )}

      {categories && <CategoryList categories={categories} />}
    </div>
  );
}