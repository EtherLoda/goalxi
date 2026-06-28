"use client";

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
          className="hover:text-[#a1ffc2] transition-colors"
        >
          {t("title")}
        </Link>
        <span className="text-on-surface-variant/40">/</span>
        {category && (
          <>
            <Link
              href={`/${locale}/forum/${slug}`}
              className="hover:text-[#a1ffc2] transition-colors"
            >
              {category.name}
            </Link>
            <span className="text-on-surface-variant/40">/</span>
          </>
        )}
        <span className="text-[#d3f5e8]">{t("newThread")}</span>
      </nav>

      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-[#a1ffc2] text-3xl">
          edit
        </span>
        <h1 className="font-headline font-black text-3xl uppercase tracking-tight text-[#d3f5e8]">
          {t("newThreadTitle")}
        </h1>
      </div>

      {error && (
        <div className="glass-panel p-4 mb-6 rounded-2xl border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-3 font-body text-sm text-red-300">
            <span className="material-symbols-outlined">error</span>
            {error}
          </div>
        </div>
      )}

      {!category && !error && (
        <div className="glass-panel p-12 rounded-2xl border border-outline-variant/10 text-center">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/40 mb-3 block animate-pulse">
            hourglass_empty
          </span>
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