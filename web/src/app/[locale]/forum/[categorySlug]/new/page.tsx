"use client";

import { AppIcon } from "@/components/icons/AppIcon";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { forumApi, ForumCategory } from "@/lib/forum-api";
import NewThreadForm from "@/components/forum/NewThreadForm";

export default function NewThreadPage() {
  const params = useParams();
  const locale = (params.locale as string) || "en";
  const slug = params.categorySlug as string;
  const t = useTranslations("forum");

  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    forumApi
      .getCategoryBySlug(slug)
      .then(setCategory)
      .catch((err: any) => setError(err?.message ?? t("loadError")));
  }, [slug, t]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <nav className="flex items-center gap-2 font-label text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-4">
        <Link
          href={`/${locale}/forum`}
          className="hover:text-accent transition-colors"
        >
          {t("title")}
        </Link>
        <span className="text-on-surface-variant/40">/</span>
        {category && (
          <>
            <Link
              href={`/${locale}/forum/${slug}`}
              className="hover:text-accent transition-colors"
            >
              {category.name}
            </Link>
            <span className="text-on-surface-variant/40">/</span>
          </>
        )}
        <span className="text-frost">{t("newThread")}</span>
      </nav>

      <div className="flex items-center gap-3 mb-6">
        <AppIcon name="edit" className="text-accent text-3xl" />
        <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-frost">
          {t("newThreadTitle")}
        </h1>
      </div>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-danger/30 bg-danger/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <AppIcon name="error" />
            {error}
          </div>
        </div>
      )}

      {!category && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <AppIcon name="hourglass_empty" className="text-4xl text-on-surface-variant/40 mb-3 block animate-pulse" />
          <p className="font-headline text-on-surface-variant">{t("loading")}</p>
        </div>
      )}

      {category && (
        <NewThreadForm
          categoryId={category.id}
          categorySlug={slug}
          locale={locale}
        />
      )}
    </div>
  );
}